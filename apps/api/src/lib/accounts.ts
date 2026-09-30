import { randomInt } from "node:crypto"
import { type User, users } from "../db/schema"
import type { Tx } from "../db/types"
import { isUniqueViolation } from "./invite-codes"
import { grantWelcomeRedo } from "./redos"
import { recordReferralAtSignup } from "./referrals"

export type SignupReferral = {
	code: string
	source: "invite_link" | "manual_code"
}

type NewAccount = {
	name: string
	username: string
	email: string
	passwordHash: string | null
	emailVerified: boolean
	referral: SignupReferral | null
	signupIp: string | null
}

// The account, its attribution, and the invitee's own welcome redo go in
// together: an account created with its referral row missing would silently
// owe two people a redo that no later step ever grants. Shared by every way
// in (email signup, Google) so that guarantee lives in one place.
export async function createAccount(
	tx: Tx,
	account: NewAccount,
): Promise<{ user: User; redoGranted: boolean }> {
	const { referral, signupIp, ...values } = account
	const [created] = await tx.insert(users).values(values).returning()
	if (!created) throw new Error("User insert returned no row")

	if (!referral) return { user: created, redoGranted: false }

	const row = await recordReferralAtSignup(
		tx,
		created,
		referral.code,
		referral.source,
		signupIp,
	)
	// Both sides of an invite get a redo. The invitee's lands now rather than
	// on their first call, because it is the reason they used the link at
	// all. A code that matched nothing leaves the row null and grants nothing.
	if (!row) return { user: created, redoGranted: false }

	await grantWelcomeRedo(tx, created.id, row.id)
	return { user: created, redoGranted: true }
}

const USERNAME_MIN = 3
const USERNAME_MAX = 24
const SUFFIX_DIGITS = 4
const MAX_USERNAME_ATTEMPTS = 6

// A valid username derived from an email address, for accounts that never
// typed one. The local part is the closest thing to a handle the person
// already uses. Plus-addressing tags are dropped, and separators become
// underscores so "john.smith" reads as "john_smith" rather than "johnsmith".
export function usernameBaseFromEmail(email: string, name: string): string {
	const slug = (raw: string) =>
		raw
			.toLowerCase()
			.replace(/[.\-\s]+/g, "_")
			.replace(/[^a-z0-9_]/g, "")
			.replace(/_+/g, "_")
			.replace(/^_|_$/g, "")

	const local = email.split("@")[0]?.split("+")[0] ?? ""
	let base = slug(local)
	if (base.length < USERNAME_MIN) base = slug(name)
	if (base.length < USERNAME_MIN) base = "player"
	// Room for the numeric suffix a taken name falls back to.
	return base.slice(0, USERNAME_MAX - SUFFIX_DIGITS).replace(/_$/, "")
}

function withSuffix(base: string): string {
	const suffix = String(randomInt(10 ** SUFFIX_DIGITS)).padStart(
		SUFFIX_DIGITS,
		"0",
	)
	return `${base}${suffix}`
}

// Creates an account whose username is picked for them: the bare base when
// it's free, otherwise the base with a random numeric suffix. Each attempt
// runs in its own savepoint, so a collision on the username's unique index
// rolls back that attempt rather than the caller's transaction.
//
// The email's uniqueness is the caller's to have checked before calling.
export async function createAccountWithGeneratedUsername(
	tx: Tx,
	account: Omit<NewAccount, "username"> & { usernameBase: string },
) {
	const { usernameBase, ...rest } = account
	for (let i = 0; i < MAX_USERNAME_ATTEMPTS; i++) {
		const username = i === 0 ? usernameBase : withSuffix(usernameBase)
		const taken = await tx.query.users.findFirst({
			where: { username },
			columns: { id: true },
		})
		if (taken) continue
		try {
			return await tx.transaction((sp) =>
				createAccount(sp, { ...rest, username }),
			)
		} catch (err) {
			if (!isUniqueViolation(err)) throw err
		}
	}
	throw new Error("Could not generate a unique username")
}
