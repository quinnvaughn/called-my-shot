import { createHash } from "node:crypto"
import { eq } from "drizzle-orm"
import { db } from "../db"
import { passwordResetTokens, sessions, type User, users } from "../db/schema"
import { env } from "../env"
import { ValidationError } from "./errors"
import { sendMail } from "./mailer"
import { hashPassword } from "./password"
import { randomToken } from "./tokens"

const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000

// A second request inside this window keeps the link already sent and sends
// nothing, so the request form can't be used to flood someone's inbox.
const PASSWORD_RESET_RESEND_COOLDOWN_MS = 60 * 1000

export function hashResetToken(token: string) {
	return createHash("sha256").update(token).digest("hex")
}

// Sends a reset link if the email belongs to an account, and does nothing
// otherwise. The caller answers the same either way, which is what keeps the
// form from revealing which emails have accounts.
//
// An account made through Google gets a link too: following it proves the
// same inbox ownership that settings relies on to let such an account set a
// first password.
export async function issuePasswordReset(email: string) {
	const user = await db.query.users.findFirst({ where: { email } })
	if (!user) return

	const existing = await db.query.passwordResetTokens.findFirst({
		where: { userId: user.id },
	})
	if (
		existing &&
		Date.now() - existing.createdAt.getTime() <
			PASSWORD_RESET_RESEND_COOLDOWN_MS
	) {
		return
	}

	const token = randomToken()
	await db
		.delete(passwordResetTokens)
		.where(eq(passwordResetTokens.userId, user.id))
	await db.insert(passwordResetTokens).values({
		userId: user.id,
		tokenHash: hashResetToken(token),
		expiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS),
	})

	const resetUrl = `${env.CLIENT_ORIGIN}/reset-password?token=${token}`
	// Never gated by email preferences (see lib/email-prefs.ts) - it's how
	// someone gets back into their account.
	await sendMail({
		to: user.email,
		subject: "Reset your password",
		text: `Reset your Called My Shot password: ${resetUrl}\n\nThis link works once and expires in 1 hour. If you didn't ask for it, you can ignore this email. Your password hasn't changed.`,
		tags: [{ name: "type", value: "password_reset" }],
	})
}

// Spends the token and sets the new password. Every existing session is
// signed out, since a reset is often how someone takes an account back.
//
// The token is deleted with DELETE ... RETURNING, so two submits of the same
// link can't both succeed. Following the link also proves the user owns the
// inbox, so it marks the email verified the same way confirmEmailChange does.
export async function consumePasswordReset(
	token: string,
	newPassword: string,
): Promise<User> {
	const invalidLink = () =>
		ValidationError.field(null, "This reset link is invalid or expired.")

	return db.transaction(async (tx) => {
		const [spent] = await tx
			.delete(passwordResetTokens)
			.where(eq(passwordResetTokens.tokenHash, hashResetToken(token)))
			.returning()
		if (!spent || spent.expiresAt < new Date()) throw invalidLink()

		const [updated] = await tx
			.update(users)
			.set({
				passwordHash: await hashPassword(newPassword),
				emailVerified: true,
			})
			.where(eq(users.id, spent.userId))
			.returning()
		if (!updated) throw invalidLink()

		await tx.delete(sessions).where(eq(sessions.userId, updated.id))
		return updated
	})
}
