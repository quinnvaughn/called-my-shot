import {
	deleteAccountSchema,
	requestEmailChangeSchema,
	updateNameSchema,
	updatePasswordSchema,
	updateUsernameSchema,
	usernameSchema,
} from "@called-my-shot/schemas"
import { eq } from "drizzle-orm"
import { db } from "../../db"
import type { League } from "../../db/schema"
import { pendingEmailChanges, type questionShape, users } from "../../db/schema"
import { env } from "../../env"
import { SortDirection } from "../../lib/admin-pagination"
import { requireAdmin, requireUser } from "../../lib/auth"
import {
	AuthenticationError,
	AuthorizationError,
	NotFoundError,
	ValidationError,
} from "../../lib/errors"
import {
	buildGlobalLeaderboard,
	type LeaderboardEntry,
} from "../../lib/global-leaderboard"
import { sendMail } from "../../lib/mailer"
import { hashPassword, verifyPassword } from "../../lib/password"
import { accuracyFrom, scoreCalls } from "../../lib/scoring"
import { clearSessionCookie } from "../../lib/session"
import { randomToken } from "../../lib/tokens"
import { builder } from "../builder"
import { CallRef, QuestionShape, VoidReason } from "./question"
import { LeagueRef } from "./sports"

// Deliberately doesn't reuse LeaderboardEntryRef from ./leaderboard: that
// type has its own `user` field, and importing it here would make this
// module and leaderboard.ts each depend on a type the other defines
// (LeaderboardEntry.user needs UserRef, User.careerStats needs
// LeaderboardEntry) - a real circular module import, not just a formatting
// preference. This ref skips the redundant `user` field entirely.
const UserCareerStatsRef = builder
	.objectRef<LeaderboardEntry>("UserCareerStats")
	.implement({
		fields: (t) => ({
			rank: t.exposeInt("rank"),
			totalPoints: t.exposeInt("totalPoints"),
			accuracy: t.exposeFloat("accuracy", { nullable: true }),
			callCount: t.exposeInt("callCount"),
			resolvedCallCount: t.exposeInt("resolvedCallCount"),
		}),
	})

const PendingEmailChangeRef = builder.drizzleObject("pendingEmailChanges", {
	name: "PendingEmailChange",
	fields: (t) => ({
		newEmail: t.exposeString("newEmail"),
		expiresAt: t.field({
			type: "String",
			resolve: (pending) => pending.expiresAt.toISOString(),
		}),
	}),
})

export const UserRef = builder.drizzleObject("users", {
	name: "User",
	fields: (t) => ({
		id: t.exposeID("id"),
		name: t.exposeString("name"),
		username: t.exposeString("username"),
		email: t.exposeString("email"),
		isAdmin: t.exposeBoolean("isAdmin"),
		emailVerified: t.exposeBoolean("emailVerified"),
		// Admin-facing fields - Users tab strikes/creation-lock/verified badge.
		// Exposed on User generally rather than a separate admin-only type since
		// they're not sensitive, just not surfaced anywhere in the consumer UI yet.
		isVerifiedPundit: t.exposeBoolean("isVerifiedPundit"),
		strikeCount: t.exposeInt("strikeCount"),
		questionCreationEnabled: t.exposeBoolean("questionCreationEnabled"),
		pendingEmailChange: t.field({
			type: PendingEmailChangeRef,
			nullable: true,
			resolve: (user) =>
				db.query.pendingEmailChanges.findFirst({
					where: { userId: user.id },
				}),
		}),
		createdAt: t.field({
			type: "String",
			resolve: (user) => user.createdAt.toISOString(),
		}),
		// null until this user has made a single call site-wide
		careerStats: t.field({
			type: UserCareerStatsRef,
			nullable: true,
			resolve: async (user) => {
				// No league, no season scope - a career total is exactly the
				// unfiltered board, and stays that way as the leaderboard itself
				// moves to defaulting to the current season.
				const entries = await buildGlobalLeaderboard()
				return entries.find((entry) => entry.user.id === user.id) ?? null
			},
		}),
		leagues: t.field({
			type: [UserLeagueStatsRef],
			resolve: (user) => buildUserLeagueStats(user.id),
		}),
		recentCalls: t.field({
			type: [CallRef],
			resolve: (user) =>
				db.query.calls.findMany({
					where: { userId: user.id },
					orderBy: { createdAt: "desc", id: "desc" },
					limit: 3,
				}),
		}),
	}),
})

// Users tab's "void history" list - the only remaining record of a voided
// question, since voidQuestion hard-deletes the question row itself (see
// questionVoids on the questions schema for why).
export const QuestionVoidRef = builder.drizzleObject("questionVoids", {
	name: "QuestionVoid",
	fields: (t) => ({
		id: t.exposeID("id"),
		questionTitle: t.exposeString("questionTitle"),
		reason: t.field({ type: VoidReason, resolve: (v) => v.reason }),
		note: t.exposeString("note", { nullable: true }),
		countsAsStrike: t.exposeBoolean("countsAsStrike"),
		createdAt: t.field({
			type: "String",
			resolve: (v) => v.createdAt.toISOString(),
		}),
		voidedByAdmin: t.relation("voidedByAdmin", { nullable: true }),
	}),
})

type ShapeAccuracyData = {
	shape: (typeof questionShape.enumValues)[number]
	accuracy: number | null
	callCount: number
}

const ShapeAccuracyRef = builder
	.objectRef<ShapeAccuracyData>("ShapeAccuracy")
	.implement({
		fields: (t) => ({
			shape: t.field({ type: QuestionShape, resolve: (s) => s.shape }),
			accuracy: t.exposeFloat("accuracy", { nullable: true }),
			callCount: t.exposeInt("callCount"),
		}),
	})

type UserLeagueStatsData = {
	league: League
	totalPoints: number
	rank: number
	accuracy: number | null
	callCount: number
	shapeBreakdown: ShapeAccuracyData[]
}

const UserLeagueStatsRef = builder
	.objectRef<UserLeagueStatsData>("UserLeagueStats")
	.implement({
		fields: (t) => ({
			league: t.field({ type: LeagueRef, resolve: (row) => row.league }),
			totalPoints: t.exposeInt("totalPoints"),
			rank: t.exposeInt("rank"),
			accuracy: t.exposeFloat("accuracy", { nullable: true }),
			callCount: t.exposeInt("callCount"),
			shapeBreakdown: t.field({
				type: [ShapeAccuracyRef],
				resolve: (row) => row.shapeBreakdown,
			}),
		}),
	})

// One entry per league this user has ever called a question in. Rank/points/
// accuracy/callCount reuse buildGlobalLeaderboard scoped to that league and
// to no season - a profile shows a career in each league, not this season's
// standing in it (the leaderboard itself is where a season-scoped ranking
// lives). Shape breakdown is new, computed the same way but grouped by
// question.shape instead of by user.
async function buildUserLeagueStats(
	userId: string,
): Promise<UserLeagueStatsData[]> {
	const userCalls = await db.query.calls.findMany({
		where: { userId },
		with: {
			selections: { with: { option: true } },
			question: { columns: { leagueId: true, shape: true } },
		},
	})

	const callsByLeague = new Map<string, typeof userCalls>()
	for (const call of userCalls) {
		const leagueId = call.question?.leagueId
		if (!leagueId) continue
		const existing = callsByLeague.get(leagueId)
		if (existing) existing.push(call)
		else callsByLeague.set(leagueId, [call])
	}
	if (callsByLeague.size === 0) return []

	const leagueIds = [...callsByLeague.keys()]
	const leagues = await db.query.leagues.findMany({
		where: { id: { in: leagueIds } },
	})
	const leaguesById = new Map(leagues.map((league) => [league.id, league]))

	const results: UserLeagueStatsData[] = []
	for (const leagueId of leagueIds) {
		const league = leaguesById.get(leagueId)
		const calls = callsByLeague.get(leagueId)
		if (!league || !calls) continue

		// user has at least one call in this league by construction above, and
		// buildGlobalLeaderboard only excludes users with zero calls in scope,
		// so this entry always exists.
		const boardEntries = await buildGlobalLeaderboard({ leagueId })
		const entry = boardEntries.find((e) => e.user.id === userId)
		if (!entry) continue

		const callsByShape = new Map<ShapeAccuracyData["shape"], typeof calls>()
		for (const call of calls) {
			const shape = call.question?.shape
			if (!shape) continue
			const existing = callsByShape.get(shape)
			if (existing) existing.push(call)
			else callsByShape.set(shape, [call])
		}

		const shapeBreakdown: ShapeAccuracyData[] = [...callsByShape.entries()].map(
			([shape, shapeCalls]) => {
				const summary = scoreCalls(shapeCalls)
				return {
					shape,
					accuracy: accuracyFrom(summary),
					callCount: shapeCalls.length,
				}
			},
		)

		results.push({
			league,
			totalPoints: entry.totalPoints,
			rank: entry.rank,
			accuracy: entry.accuracy,
			callCount: entry.callCount,
			shapeBreakdown,
		})
	}

	return results
}

const UpdateMyNameInput = builder.inputType("UpdateMyNameInput", {
	fields: (t) => ({
		name: t.string({ required: true }),
	}),
})

const UpdateUsernameInput = builder.inputType("UpdateUsernameInput", {
	fields: (t) => ({
		username: t.string({ required: true }),
	}),
})

const RequestEmailChangeInput = builder.inputType("RequestEmailChangeInput", {
	fields: (t) => ({
		newEmail: t.string({ required: true }),
		password: t.string({ required: true }),
	}),
})

const UpdatePasswordInput = builder.inputType("UpdatePasswordInput", {
	fields: (t) => ({
		currentPassword: t.string({ required: true }),
		newPassword: t.string({ required: true }),
	}),
})

const DeleteAccountInput = builder.inputType("DeleteAccountInput", {
	fields: (t) => ({
		password: t.string({ required: true }),
	}),
})

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
	await sendMail(
		newEmail,
		isInitialVerification ? "Verify your email" : "Confirm your new email",
		isInitialVerification
			? `Welcome to Called My Shot! Confirm your email: ${confirmUrl}`
			: `Confirm this change to your Called My Shot email: ${confirmUrl}\n\nIf you didn't request this, you can ignore this email.`,
	)
	if (!isInitialVerification) {
		await sendMail(
			currentEmail,
			"Email change requested",
			`Someone requested to change the email on your Called My Shot account to ${newEmail}. Wasn't you? Secure your account - your current password can still sign in.`,
		)
	}
}

const AdminUserSort = builder.enumType("AdminUserSort", {
	values: {
		USERNAME: { value: "username" },
		STRIKES: { value: "strikeCount" },
		VERIFIED: { value: "isVerifiedPundit" },
		CREATION_ENABLED: { value: "questionCreationEnabled" },
	},
})

builder.queryFields((t) => ({
	me: t.field({
		type: UserRef,
		nullable: true,
		resolve: (_root, _args, ctx) => ctx.user,
	}),
	user: t.drizzleField({
		type: "users",
		nullable: true,
		args: {
			id: t.arg.id({ required: true }),
		},
		resolve: (query, _root, args) =>
			db.query.users.findFirst(query({ where: { id: args.id } })),
	}),
	userByUsername: t.drizzleField({
		type: "users",
		nullable: true,
		args: {
			username: t.arg.string({ required: true }),
		},
		resolve: (query, _root, args) =>
			db.query.users.findFirst(query({ where: { username: args.username } })),
	}),
	usernameAvailable: t.boolean({
		args: {
			username: t.arg.string({ required: true }),
		},
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const parsed = usernameSchema.safeParse(args.username)
			if (!parsed.success) return false
			const existing = await db.query.users.findFirst({
				where: { username: parsed.data },
			})
			return !existing || existing.id === user.id
		},
	}),

	// Users tab - plain list + optional search, no cursor pagination, same
	// "admin tool stays light" reasoning as adminGames in sports.ts. Sort is a
	// real column only - Points isn't included since it's a derived value
	// (buildGlobalLeaderboard, computed per-row by UserRef.careerStats below)
	// with no stored column to order by cheaply across the whole table.
	adminUsers: t.field({
		type: [UserRef],
		errors: { types: [AuthenticationError, AuthorizationError] },
		args: {
			search: t.arg.string({ required: false }),
			sortBy: t.arg({ type: AdminUserSort, required: false }),
			sortDir: t.arg({ type: SortDirection, required: false }),
		},
		resolve: (_root, args, ctx) => {
			requireAdmin(ctx)
			const search = args.search?.trim()
			const sortBy = args.sortBy ?? "username"
			const sortDir = args.sortDir ?? "asc"
			return db.query.users.findMany({
				where: search
					? {
							OR: [
								{ name: { ilike: `%${search}%` } },
								{ username: { ilike: `%${search}%` } },
							],
						}
					: undefined,
				orderBy: { [sortBy]: sortDir },
			})
		},
	}),

	adminUserVoidHistory: t.field({
		type: [QuestionVoidRef],
		errors: { types: [AuthenticationError, AuthorizationError] },
		args: { userId: t.arg.id({ required: true }) },
		resolve: (_root, args, ctx) => {
			requireAdmin(ctx)
			return db.query.questionVoids.findMany({
				where: { targetUserId: args.userId },
				orderBy: { createdAt: "desc" },
			})
		},
	}),
}))

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
				.set({ email: pending.newEmail, emailVerified: true })
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
			// cascade-deleted) - but only the creator can ever resolve a
			// question. An open/locked/disputed one would be stuck forever
			// with no creator left to resolve it, so block deletion until
			// those are settled instead.
			const unresolvedQuestion = await db.query.questions.findFirst({
				where: {
					creatorId: user.id,
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
}))
