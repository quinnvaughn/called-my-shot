import { randomInt } from "node:crypto"

// Shared by every kind of hand-shareable code in the app - group invites and
// personal referral links. One alphabet rather than one per feature: these
// codes get read aloud off a phone screen and typed into a different device,
// and two subtly different alphabets would mean "is 0 allowed here" has two
// answers.
//
// Excludes 0/O and 1/I/L - easy to tell apart if someone reads or types it by hand.
const INVITE_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
const INVITE_CODE_LENGTH = 6
const MAX_CODE_ATTEMPTS = 5

export function generateInviteCode() {
	let code = ""
	for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
		code += INVITE_CODE_ALPHABET[randomInt(INVITE_CODE_ALPHABET.length)]
	}
	return code
}

// What a hand-typed code has to look like before it's worth a database
// lookup. Case is normalized up, since the alphabet is upper-only and nobody
// typing a code by hand should have to care.
export function normalizeInviteCode(input: string): string {
	return input.trim().toUpperCase()
}

export function isValidInviteCodeShape(code: string): boolean {
	return (
		code.length === INVITE_CODE_LENGTH &&
		[...code].every((c) => INVITE_CODE_ALPHABET.includes(c))
	)
}

export function isUniqueViolation(err: unknown): boolean {
	return (
		typeof err === "object" &&
		err !== null &&
		"code" in err &&
		(err as { code?: string }).code === "23505"
	)
}

// Retries an insert that could collide on the code's unique index. Callers
// that run inside a transaction should wrap each attempt in its own savepoint
// so a collision rolls back the attempt rather than the caller's whole
// transaction - see insertGroupInvite.
export async function withRetriedCode<T>(
	attempt: (code: string) => Promise<T>,
): Promise<T> {
	for (let i = 0; i < MAX_CODE_ATTEMPTS; i++) {
		try {
			return await attempt(generateInviteCode())
		} catch (err) {
			if (!isUniqueViolation(err) || i === MAX_CODE_ATTEMPTS - 1) throw err
		}
	}
	throw new Error("Could not generate a unique invite code")
}
