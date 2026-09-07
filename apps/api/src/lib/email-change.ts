import { eq } from "drizzle-orm"
import { db } from "../db"
import { pendingEmailChanges } from "../db/schema"
import { env } from "../env"
import { sendMail } from "./mailer"
import { randomToken } from "./tokens"

const EMAIL_CHANGE_TOKEN_TTL_MS = 24 * 60 * 60 * 1000

// Always leaves a pending row behind and always looks like it worked from the
// caller's side, whether or not newEmail is actually free - that's what makes
// this flow safe against being used to probe which emails have accounts. The
// only thing that's conditional is whether the two stub emails actually go
// out.
//
// Also doubles as the initial signup-verification send: called with
// newEmail === currentEmail, it's "change your email to itself", which
// confirmEmailChange resolves down to just flipping emailVerified. That case
// skips the "someone requested to change your email" notice, since there's
// no prior email to warn.
//
// redirectTo controls where confirm-email's button sends the user afterward
// - this same mutation is triggered from multiple places (settings, the
// new-question verification gate, ...) that each want to land somewhere
// different once confirmed, rather than always assuming "settings".
export async function issuePendingEmailChange(
	userId: string,
	currentEmail: string,
	newEmail: string,
	redirectTo?: string,
) {
	const isInitialVerification = newEmail === currentEmail
	const token = randomToken()
	const expiresAt = new Date(Date.now() + EMAIL_CHANGE_TOKEN_TTL_MS)

	await db
		.delete(pendingEmailChanges)
		.where(eq(pendingEmailChanges.userId, userId))
	await db.insert(pendingEmailChanges).values({
		userId,
		newEmail,
		token,
		expiresAt,
	})

	const takenByAnotherUser = await db.query.users.findFirst({
		where: { email: newEmail, id: { ne: userId } },
	})
	if (takenByAnotherUser) return

	const confirmUrl = `${env.CLIENT_ORIGIN}/confirm-email?token=${token}${
		redirectTo ? `&redirect=${encodeURIComponent(redirectTo)}` : ""
	}`
	// Never gated by email preferences (see lib/email-prefs.ts) - this is how
	// someone proves or protects ownership of an inbox, so an opt-out must not
	// be able to stop it.
	await sendMail({
		to: newEmail,
		subject: isInitialVerification
			? "Verify your email"
			: "Confirm your new email",
		text: isInitialVerification
			? `Welcome to Called My Shot! Confirm your email: ${confirmUrl}`
			: `Confirm this change to your Called My Shot email: ${confirmUrl}\n\nIf you didn't request this, you can ignore this email.`,
	})
	if (!isInitialVerification) {
		await sendMail({
			to: currentEmail,
			subject: "Email change requested",
			text: `Someone requested to change the email on your Called My Shot account to ${newEmail}. Wasn't you? Secure your account - your current password can still sign in.`,
		})
	}
}
