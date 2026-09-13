import {
	deleteAccountSchema,
	requestEmailChangeSchema,
	updateNameSchema,
	updatePasswordSchema,
	updateUsernameSchema,
} from "@called-my-shot/schemas"
import { eq } from "drizzle-orm"
import { db } from "../../../db"
import { pendingEmailChanges, users } from "../../../db/schema"
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
import { builder } from "../../builder"
import {
	DeleteAccountInput,
	RequestEmailChangeInput,
	SetEmailPreferenceInput,
	UpdateMyNameInput,
	UpdatePasswordInput,
	UpdateUsernameInput,
} from "./inputs"
import { UserRef } from "./refs"

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
			const parsed = updateNameSchema.safeParse(args.input)
			if (!parsed.success) {
				throw ValidationError.fromZodIssues(parsed.error.issues)
			}

			const [updated] = await db
				.update(users)
				.set({ name: parsed.data.name })
				.where(eq(users.id, user.id))
				.returning()
			if (!updated) throw new Error("updateMyName: user vanished mid-request")
			return updated
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
			const parsed = updateUsernameSchema.safeParse(args.input)
			if (!parsed.success) {
				throw ValidationError.fromZodIssues(parsed.error.issues)
			}
			const { username } = parsed.data

			if (username !== user.username) {
				const existing = await db.query.users.findFirst({
					where: { username },
				})
				if (existing) {
					throw ValidationError.field("username", "That username is taken")
				}
			}

			const [updated] = await db
				.update(users)
				.set({ username })
				.where(eq(users.id, user.id))
				.returning()
			if (!updated) throw new Error("updateUsername: user vanished mid-request")
			return updated
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
			const parsed = requestEmailChangeSchema.safeParse(args.input)
			if (!parsed.success) {
				throw ValidationError.fromZodIssues(parsed.error.issues)
			}
			const { newEmail, password } = parsed.data

			if (!(await verifyPassword(user.passwordHash, password))) {
				throw ValidationError.field("password", "Incorrect password")
			}
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
		resolve: async (_root, args) => {
			const invalidLink = () =>
				ValidationError.field(
					null,
					"This confirmation link is invalid or expired.",
				)

			const pending = await db.query.pendingEmailChanges.findFirst({
				where: { token: args.token },
			})
			if (!pending || pending.expiresAt < new Date()) throw invalidLink()

			const stillFree = !(await db.query.users.findFirst({
				where: { email: pending.newEmail, id: { ne: pending.userId } },
			}))
			if (!stillFree) throw invalidLink()

			const [updated] = await db
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
			await db
				.delete(pendingEmailChanges)
				.where(eq(pendingEmailChanges.id, pending.id))
			if (!updated) throw invalidLink()
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
			const parsed = updatePasswordSchema.safeParse(args.input)
			if (!parsed.success) {
				throw ValidationError.fromZodIssues(parsed.error.issues)
			}
			const { currentPassword, newPassword } = parsed.data

			if (!(await verifyPassword(user.passwordHash, currentPassword))) {
				throw ValidationError.field(
					"currentPassword",
					"Current password is incorrect",
				)
			}

			const passwordHash = await hashPassword(newPassword)
			const [updated] = await db
				.update(users)
				.set({ passwordHash })
				.where(eq(users.id, user.id))
				.returning()
			if (!updated) throw new Error("updatePassword: user vanished mid-request")
			return updated
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
			const parsed = deleteAccountSchema.safeParse(args.input)
			if (!parsed.success) {
				throw ValidationError.fromZodIssues(parsed.error.issues)
			}

			if (!(await verifyPassword(user.passwordHash, parsed.data.password))) {
				throw ValidationError.field("password", "Incorrect password")
			}

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
			const [updated] = await db
				.update(users)
				.set({ questionCreationEnabled: args.enabled })
				.where(eq(users.id, args.userId))
				.returning()
			if (!updated) throw new NotFoundError("User not found")
			return updated
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
			const [updated] = await db
				.update(users)
				.set({ isVerifiedPundit: args.verified })
				.where(eq(users.id, args.userId))
				.returning()
			if (!updated) throw new NotFoundError("User not found")
			return updated
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
			types: [ValidationError],
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
			const [updated] = await db
				.update(users)
				.set({ onboardingDismissedAt: new Date() })
				.where(eq(users.id, user.id))
				.returning()
			if (!updated) {
				throw new Error("dismissOnboarding: user vanished mid-request")
			}
			return updated
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
			const [updated] = await db
				.update(users)
				.set({ onboardingCollapsedAt: args.collapsed ? new Date() : null })
				.where(eq(users.id, user.id))
				.returning()
			if (!updated) {
				throw new Error("setOnboardingCollapsed: user vanished mid-request")
			}
			return updated
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
			const [updated] = await db
				.update(users)
				.set({ onboardingDismissedAt: null, onboardingCollapsedAt: null })
				.where(eq(users.id, user.id))
				.returning()
			if (!updated) {
				throw new Error("restartOnboarding: user vanished mid-request")
			}
			return updated
		},
	}),
}))
