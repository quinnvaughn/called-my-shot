import {
	deleteAccountSchema,
	requestEmailChangeSchema,
	updateNameSchema,
	updatePasswordSchema,
	updateUsernameSchema,
} from "@called-my-shot/schemas"
import { eq, sql } from "drizzle-orm"
import type { PgUpdateSetSource } from "drizzle-orm/pg-core"
import { db } from "../../../db"
import { pendingEmailChanges, type User, users } from "../../../db/schema"
import { requireAdmin, requireUser } from "../../../lib/auth"
import { issuePendingEmailChange } from "../../../lib/email-change"
import { setEmailPreference } from "../../../lib/email-prefs"
import { verifyUnsubscribeToken } from "../../../lib/email-unsubscribe"
import {
	AuthenticationError,
	AuthorizationError,
	NotFoundError,
	ValidationError,
} from "../../../lib/errors"
import { hashPassword, verifyPassword } from "../../../lib/password"
import { clearSessionCookie } from "../../../lib/session"
import { deleteImage } from "../../../lib/storage"
import { builder } from "../../builder"
import { parseInput } from "../../helpers"
import {
	DeleteAccountInput,
	RequestEmailChangeInput,
	SetEmailPreferenceInput,
	UpdateMyNameInput,
	UpdatePasswordInput,
	UpdateUsernameInput,
} from "./inputs"
import { UserRef } from "./refs"

type UserUpdate = PgUpdateSetSource<typeof users>

// Writes to the signed-in viewer's own row and returns it updated. The row
// was just read to authenticate the request, so a miss here is a bug rather
// than a user error.
async function updateViewer(viewer: User, values: UserUpdate): Promise<User> {
	const [updated] = await db
		.update(users)
		.set(values)
		.where(eq(users.id, viewer.id))
		.returning()
	if (!updated) throw new Error(`user ${viewer.id} vanished mid-request`)
	return updated
}

// Admin writes to someone else's row, where the id comes from the client.
async function updateUserOrThrow(
	userId: string,
	values: UserUpdate,
): Promise<User> {
	const [updated] = await db
		.update(users)
		.set(values)
		.where(eq(users.id, userId))
		.returning()
	if (!updated) throw new NotFoundError("User not found")
	return updated
}

// Re-confirms the viewer's password before a sensitive change. An account
// made through Google has no password to re-confirm, so its signed-in session
// is the only proof there is and the check passes.
async function requirePassword(
	viewer: User,
	password: string | null | undefined,
	field = "password",
	message = "Incorrect password",
) {
	if (!viewer.passwordHash) return
	if (!password) throw ValidationError.field(field, "Enter your password")
	if (!(await verifyPassword(viewer.passwordHash, password))) {
		throw ValidationError.field(field, message)
	}
}

builder.mutationFields((t) => ({
	updateMyName: t.field({
		type: UserRef,
		errors: {
			types: [AuthenticationError],
			directResult: true,
			union: { name: "UpdateMyNameResult" },
		},
		args: { input: t.arg({ type: UpdateMyNameInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const { name } = parseInput(updateNameSchema, args.input)

			return updateViewer(user, { name })
		},
	}),

	updateUsername: t.field({
		type: UserRef,
		errors: {
			types: [AuthenticationError],
			directResult: true,
			union: { name: "UpdateUsernameResult" },
		},
		args: { input: t.arg({ type: UpdateUsernameInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const { username } = parseInput(updateUsernameSchema, args.input)

			if (username !== user.username) {
				const existing = await db.query.users.findFirst({
					where: { username },
				})
				if (existing) {
					throw ValidationError.field("username", "That username is taken")
				}
			}

			return updateViewer(user, { username })
		},
	}),

	requestEmailChange: t.field({
		type: UserRef,
		errors: {
			types: [AuthenticationError],
			directResult: true,
			union: { name: "RequestEmailChangeResult" },
		},
		args: { input: t.arg({ type: RequestEmailChangeInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const { newEmail, password } = parseInput(
				requestEmailChangeSchema.partial({ password: true }),
				{ ...args.input, password: args.input.password ?? undefined },
			)

			await requirePassword(user, password)
			if (newEmail === user.email) {
				throw ValidationError.field("newEmail", "That's already your email")
			}

			await issuePendingEmailChange(user.id, user.email, newEmail, "/settings")
			return user
		},
	}),

	// Returns the user (with its refreshed pendingEmailChange) rather than a
	// bare boolean - directResult needs an ObjectType to merge into the error
	// union, and this saves the frontend a round trip to re-sync state.
	//
	// No pending row isn't an error here - it just means this user (seeded,
	// or created before initial-signup verification existed) never had one
	// issued. Falling back to their current email makes this double as
	// "(re)send my verification email" for any account, not just ones
	// mid email-change.
	resendEmailChange: t.field({
		type: UserRef,
		errors: {
			types: [AuthenticationError],
			directResult: true,
			union: { name: "ResendEmailChangeResult" },
		},
		args: { redirectTo: t.arg.string({ required: false }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const pending = await db.query.pendingEmailChanges.findFirst({
				where: { userId: user.id },
			})

			await issuePendingEmailChange(
				user.id,
				user.email,
				pending?.newEmail ?? user.email,
				args.redirectTo ?? "/settings",
			)
			return user
		},
	}),

	cancelEmailChange: t.field({
		type: UserRef,
		errors: {
			types: [AuthenticationError],
			directResult: true,
			union: { name: "CancelEmailChangeResult" },
		},
		resolve: async (_root, _args, ctx) => {
			const user = requireUser(ctx)
			await db
				.delete(pendingEmailChanges)
				.where(eq(pendingEmailChanges.userId, user.id))
			return user
		},
	}),

	// Deliberately not gated by requireUser - the token is the credential
	// here, the same way clicking a link in an email is, regardless of which
	// browser/session opens it.
	confirmEmailChange: t.field({
		type: UserRef,
		errors: {
			directResult: true,
			union: { name: "ConfirmEmailChangeResult" },
		},
		args: { token: t.arg.string({ required: true }) },
		resolve: async (_root, args, ctx) => {
			const invalidLink = () =>
				ValidationError.field(
					null,
					"This confirmation link is invalid or expired.",
				)

			const updated = await db.transaction(async (tx) => {
				const pending = await tx.query.pendingEmailChanges.findFirst({
					where: { token: args.token },
				})
				if (!pending || pending.expiresAt < new Date()) throw invalidLink()

				const stillFree = !(await tx.query.users.findFirst({
					where: { email: pending.newEmail, id: { ne: pending.userId } },
				}))
				if (!stillFree) throw invalidLink()

				const [row] = await tx
					.update(users)
					.set({
						email: pending.newEmail,
						emailVerified: true,
						// The old address's bounce history says nothing about this one,
						// and leaving the "your email is bouncing" banner up after
						// someone did exactly what it asked is what would make it
						// useless. Cleared here rather than through clearEmailBounce so
						// it's part of the same single update.
						emailBouncedAt: null,
						emailBounceReason: null,
					})
					.where(eq(users.id, pending.userId))
					.returning()
				await tx
					.delete(pendingEmailChanges)
					.where(eq(pendingEmailChanges.id, pending.id))
				if (!row) throw invalidLink()
				return row
			})
			ctx.ownedUserIds.add(updated.id)
			return updated
		},
	}),

	updatePassword: t.field({
		type: UserRef,
		errors: {
			types: [AuthenticationError],
			directResult: true,
			union: { name: "UpdatePasswordResult" },
		},
		args: { input: t.arg({ type: UpdatePasswordInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const { currentPassword, newPassword } = parseInput(
				updatePasswordSchema.partial({ currentPassword: true }),
				{
					...args.input,
					currentPassword: args.input.currentPassword ?? undefined,
				},
			)

			await requirePassword(
				user,
				currentPassword,
				"currentPassword",
				"Current password is incorrect",
			)

			return updateViewer(user, {
				passwordHash: await hashPassword(newPassword),
			})
		},
	}),

	// No directResult here - unlike the other fields above, there's no
	// object left to return once the account is gone, so this stays a plain
	// boolean wrapped in the plugin's auto-generated success type (same
	// shape as leaveGroup elsewhere in the schema).
	deleteAccount: t.field({
		type: "Boolean",
		errors: {
			types: [AuthenticationError],
			union: { name: "DeleteAccountResult" },
		},
		args: { input: t.arg({ type: DeleteAccountInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const { password } = parseInput(
				deleteAccountSchema.partial({ password: true }),
				{ password: args.input.password ?? undefined },
			)

			await requirePassword(user, password)

			// Deleting the account orphans authored questions rather than
			// cascading them away (questions.creatorId is set null, not
			// cascade-deleted) - but a manual question is resolved by its
			// creator. An open/locked/disputed one would be stuck with no
			// creator left to resolve it, so block deletion until those are
			// settled instead. A system question settles without them.
			const unresolvedQuestion = await db.query.questions.findFirst({
				where: {
					creatorId: user.id,
					resolutionMode: "manual",
					status: { in: ["open", "locked", "disputed"] },
				},
			})
			if (unresolvedQuestion) {
				throw ValidationError.field(
					null,
					"You have a question that hasn't been resolved yet. Resolve it before deleting your account.",
				)
			}

			await db.delete(users).where(eq(users.id, user.id))
			await Promise.all([
				deleteImage(user.avatarKey),
				deleteImage(user.bannerKey),
			])
			clearSessionCookie(ctx.res)
			return true
		},
	}),

	// Users tab toggle - always wins over voidQuestion's auto-lock (an admin
	// re-enabling isn't immediately re-flipped by a later void; only crossing
	// the strike threshold again would re-lock it).
	setUserQuestionCreationEnabled: t.field({
		type: UserRef,
		errors: {
			types: [AuthenticationError, AuthorizationError, NotFoundError],
			directResult: true,
			union: { name: "SetUserQuestionCreationEnabledResult" },
		},
		args: {
			userId: t.arg.id({ required: true }),
			enabled: t.arg.boolean({ required: true }),
		},
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			return updateUserOrThrow(args.userId, {
				questionCreationEnabled: args.enabled,
			})
		},
	}),

	setUserVerified: t.field({
		type: UserRef,
		errors: {
			types: [AuthenticationError, AuthorizationError, NotFoundError],
			directResult: true,
			union: { name: "SetUserVerifiedResult" },
		},
		args: {
			userId: t.arg.id({ required: true }),
			verified: t.arg.boolean({ required: true }),
		},
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			return updateUserOrThrow(args.userId, { isVerifiedPundit: args.verified })
		},
	}),

	setEmailPreference: t.field({
		type: UserRef,
		errors: {
			types: [AuthenticationError],
			directResult: true,
			union: { name: "SetEmailPreferenceResult" },
		},
		args: { input: t.arg({ type: SetEmailPreferenceInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			await setEmailPreference(user.id, args.input.type, args.input.enabled)
			// The user row itself is unchanged - preferences live in their own
			// table - but returning it lets the client re-read mutedEmailTypes
			// off the same result rather than firing a second query.
			return user
		},
	}),

	// Deliberately not auth-gated: the signed token IS the credential, the
	// same way confirmEmailChange works. A one-click unsubscribe arrives as a
	// bare POST from a mail provider with no session and no cookie, and an
	// unsubscribe that only works while signed in is one people give up on and
	// report as spam instead.
	unsubscribeFromEmails: t.field({
		type: "Boolean",
		errors: {
			union: { name: "UnsubscribeFromEmailsResult" },
		},
		args: { token: t.arg.string({ required: true }) },
		resolve: async (_root, args) => {
			const claim = verifyUnsubscribeToken(args.token)
			if (!claim) {
				throw ValidationError.field(
					"token",
					"That unsubscribe link isn't valid",
				)
			}
			await setEmailPreference(claim.userId, claim.type, false)
			return true
		},
	}),

	// Both onboarding mutations below write nothing but a timestamp, and return
	// the user so the client can re-read onboardingDismissedAt off the result
	// instead of refetching Me.

	dismissOnboarding: t.field({
		type: UserRef,
		errors: {
			types: [AuthenticationError],
			directResult: true,
			union: { name: "DismissOnboardingResult" },
		},
		resolve: async (_root, _args, ctx) => {
			const user = requireUser(ctx)
			return updateViewer(user, { onboardingDismissedAt: new Date() })
		},
	}),

	// Collapsing is the reversible step in front of dismissing, so this takes
	// the state to set rather than being a one-way door like the two either
	// side of it.
	setOnboardingCollapsed: t.field({
		type: UserRef,
		args: { collapsed: t.arg.boolean({ required: true }) },
		errors: {
			types: [AuthenticationError],
			directResult: true,
			union: { name: "SetOnboardingCollapsedResult" },
		},
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			return updateViewer(user, {
				onboardingCollapsedAt: args.collapsed ? new Date() : null,
			})
		},
	}),

	// Stamps the first time a signed-in user opens the leaderboard, which is what
	// ticks "See where you rank" on the get-started checklist. coalesce keeps
	// the first visit's time, so every later visit is a no-op write.
	markLeaderboardViewed: t.field({
		type: UserRef,
		errors: {
			types: [AuthenticationError],
			directResult: true,
			union: { name: "MarkLeaderboardViewedResult" },
		},
		resolve: async (_root, _args, ctx) => {
			const user = requireUser(ctx)
			return updateViewer(user, {
				leaderboardViewedAt: sql`coalesce(${users.leaderboardViewedAt}, now())`,
			})
		},
	}),

	// Powers "Replay walkthrough" in the account menu, which is what makes the
	// whole thing genuinely optional rather than one-shot: dismissing it costs
	// nothing, because it can always be brought back.
	restartOnboarding: t.field({
		type: UserRef,
		errors: {
			types: [AuthenticationError],
			directResult: true,
			union: { name: "RestartOnboardingResult" },
		},
		resolve: async (_root, _args, ctx) => {
			const user = requireUser(ctx)
			// Clears the collapse too. Replaying is a request to see the thing,
			// and restoring it folded shut would be a menu item that appears to
			// do nothing.
			return updateViewer(user, {
				onboardingDismissedAt: null,
				onboardingCollapsedAt: null,
			})
		},
	}),
}))
