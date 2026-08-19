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
import {
	pendingEmailChanges,
	type questionCategory,
	users,
} from "../../db/schema"
import { env } from "../../env"
import { requireUser } from "../../lib/auth"
import { AuthenticationError, ValidationError } from "../../lib/errors"
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
import { CallRef, QuestionCategory } from "./question"
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
				const entries = await buildGlobalLeaderboard(null)
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

type CategoryAccuracyData = {
	category: (typeof questionCategory.enumValues)[number]
	accuracy: number | null
	callCount: number
}

const CategoryAccuracyRef = builder
	.objectRef<CategoryAccuracyData>("CategoryAccuracy")
	.implement({
		fields: (t) => ({
			category: t.field({ type: QuestionCategory, resolve: (c) => c.category }),
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
	categoryBreakdown: CategoryAccuracyData[]
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
			categoryBreakdown: t.field({
				type: [CategoryAccuracyRef],
				resolve: (row) => row.categoryBreakdown,
			}),
		}),
	})

// One entry per league this user has ever called a question in. Rank/points/
// accuracy/callCount reuse buildGlobalLeaderboard (same board the site-wide
// leaderboard renders) scoped to that league; category breakdown is new,
// computed the same way but grouped by question.category instead of by user.
async function buildUserLeagueStats(
	userId: string,
): Promise<UserLeagueStatsData[]> {
	const userCalls = await db.query.calls.findMany({
		where: { userId },
		with: {
			selections: { with: { option: true } },
			question: { columns: { leagueId: true, category: true } },
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
		const boardEntries = await buildGlobalLeaderboard(leagueId)
		const entry = boardEntries.find((e) => e.user.id === userId)
		if (!entry) continue

		const callsByCategory = new Map<
			CategoryAccuracyData["category"],
			typeof calls
		>()
		for (const call of calls) {
			const category = call.question?.category
			if (!category) continue
			const existing = callsByCategory.get(category)
			if (existing) existing.push(call)
			else callsByCategory.set(category, [call])
		}

		const categoryBreakdown: CategoryAccuracyData[] = [
			...callsByCategory.entries(),
		].map(([category, categoryCalls]) => {
			const summary = scoreCalls(categoryCalls)
			return {
				category,
				accuracy: accuracyFrom(summary),
				callCount: categoryCalls.length,
			}
		})

		results.push({
			league,
			totalPoints: entry.totalPoints,
			rank: entry.rank,
			accuracy: entry.accuracy,
			callCount: entry.callCount,
			categoryBreakdown,
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
async function issuePendingEmailChange(
	userId: string,
	currentEmail: string,
	newEmail: string,
) {
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

	const alreadyTaken = await db.query.users.findFirst({
		where: { email: newEmail },
	})
	if (alreadyTaken) return

	const confirmUrl = `${env.CLIENT_ORIGIN}/confirm-email?token=${token}`
	await sendMail(
		newEmail,
		"Confirm your new email",
		`Confirm this change to your Called My Shot email: ${confirmUrl}\n\nIf you didn't request this, you can ignore this email.`,
	)
	await sendMail(
		currentEmail,
		"Email change requested",
		`Someone requested to change the email on your Called My Shot account to ${newEmail}. Wasn't you? Secure your account - your current password can still sign in.`,
	)
}

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

			await issuePendingEmailChange(user.id, user.email, newEmail)
			return user
		},
	}),

	// Returns the user (with its refreshed pendingEmailChange) rather than a
	// bare boolean - directResult needs an ObjectType to merge into the error
	// union, and this saves the frontend a round trip to re-sync state.
	resendEmailChange: t.field({
		type: UserRef,
		errors: {
			types: [AuthenticationError],
			directResult: true,
			union: { name: "ResendEmailChangeResult" },
		},
		resolve: async (_root, _args, ctx) => {
			const user = requireUser(ctx)
			const pending = await db.query.pendingEmailChanges.findFirst({
				where: { userId: user.id },
			})
			if (!pending) {
				throw ValidationError.field(
					null,
					"There's no pending email change to resend",
				)
			}

			await issuePendingEmailChange(user.id, user.email, pending.newEmail)
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
				where: { email: pending.newEmail },
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
}))
