import { COLD_STREAK_MIN } from "@called-my-shot/scoring"
import { db } from "../../../db"
import { canSeePrivate } from "../../../lib/auth"
import { mutedEmailTypes } from "../../../lib/email-prefs"
import type { LeaderboardEntry } from "../../../lib/global-leaderboard"
import { redoBalanceFor } from "../../../lib/redos"
import {
	getOrCreateReferralCode,
	type ReferralStats,
	referralStatsFor,
} from "../../../lib/referrals"
import { loadReportCardResult } from "../../../lib/report-card/load"
import { ALL_TIME } from "../../../lib/seasons"
import { buildUserLeagueStats } from "../../../lib/user-stats"
import { resolveWindowByKey } from "../../../lib/windows"
import { builder } from "../../builder"
import { groupByKey, indexByKey } from "../../loader"
import { FlairRef } from "../flair"
import { CallRef, VoidReason } from "../question"
import { findLeague, ReportCardRef } from "../sports"
import { EmailPreferenceType, StreakFamilyEnum } from "./enums"
import { getGlobalLeaderboard, UserLeagueStatsRef } from "./stats"
import { UserStreakRef, UserSweepRef } from "./streaks"

// A run of 1 isn't a streak worth listing on anyone's profile.
const LISTED_STREAK_MIN = 2
const MAX_SWEEPS = 50

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
			rank: t.exposeInt("rank", { nullable: true }),
			totalPoints: t.exposeInt("totalPoints"),
			accuracy: t.exposeFloat("accuracy", { nullable: true }),
			convictionEdge: t.exposeFloat("convictionEdge", { nullable: true }),
			callCount: t.exposeInt("callCount"),
			resolvedCallCount: t.exposeInt("resolvedCallCount"),
		}),
	})

const PendingEmailChangeRef = builder.drizzleObject("pendingEmailChanges", {
	name: "PendingEmailChange",
	fields: (t) => ({
		newEmail: t.exposeString("newEmail"),
		expiresAt: t.field({
			type: "DateTime",
			resolve: (pending) => pending.expiresAt,
		}),
	}),
})

// How someone's invites are doing, for their own invite screen.
const ReferralStatsRef = builder
	.objectRef<ReferralStats>("ReferralStats")
	.implement({
		fields: (t) => ({
			invited: t.exposeInt("invited"),
			called: t.exposeInt("called"),
			waiting: t.exposeInt("waiting"),
		}),
	})

export const UserRef = builder.drizzleObject("users", {
	name: "User",
	fields: (t) => ({
		id: t.exposeID("id"),
		name: t.exposeString("name"),
		username: t.exposeString("username"),
		// Private fields below resolve null for anyone but the user and admins:
		// User is returned on public surfaces (leaderboards, call records,
		// notification actors), so an ungated field here is readable by anyone.
		email: t.string({
			nullable: true,
			resolve: (user, _args, ctx) =>
				canSeePrivate(ctx, user.id) ? user.email : null,
		}),
		isAdmin: t.exposeBoolean("isAdmin"),
		emailVerified: t.exposeBoolean("emailVerified"),
		// Admin-facing fields - Users tab strikes/creation-lock/verified badge.
		// Exposed on User generally rather than a separate admin-only type since
		// they're not sensitive, just not surfaced anywhere in the consumer UI yet.
		isVerifiedPundit: t.exposeBoolean("isVerifiedPundit"),
		strikeCount: t.exposeInt("strikeCount"),
		questionCreationEnabled: t.exposeBoolean("questionCreationEnabled"),
		pendingEmailChange: t.loadable({
			type: PendingEmailChangeRef,
			nullable: true,
			load: async (userIds: string[]) => {
				const rows = await db.query.pendingEmailChanges.findMany({
					where: { userId: { in: userIds } },
				})
				return indexByKey(userIds, rows, (row) => row.userId, null)
			},
			resolve: (user, _args, ctx) =>
				canSeePrivate(ctx, user.id) ? user.id : null,
		}),
		// Non-null means mail we sent to this address came back permanently
		// (see lib/email-bounce.ts). Drives the site-wide banner asking them to
		// fix it - unrelated to emailVerified, which is only about whether the
		// address was ever confirmed.
		emailBouncedAt: t.field({
			type: "DateTime",
			nullable: true,
			resolve: (user, _args, ctx) =>
				canSeePrivate(ctx, user.id) ? user.emailBouncedAt : null,
		}),
		// The types this user has MUTED - absence of a row is the subscribed
		// state (see db/schema/email.ts), so an empty list means "everything
		// on", which is what a brand new account gets without any backfill.
		mutedEmailTypes: t.field({
			type: [EmailPreferenceType],
			nullable: true,
			resolve: (user, _args, ctx) =>
				canSeePrivate(ctx, user.id) ? mutedEmailTypes(user.id) : null,
		}),
		// Unspent redos. Private: what someone is holding is theirs to know,
		// and a public balance would make it obvious who to ask for one.
		redoBalance: t.field({
			type: "Int",
			nullable: true,
			resolve: (user, _args, ctx) =>
				canSeePrivate(ctx, user.id) ? redoBalanceFor(user.id) : null,
		}),
		// This user's personal invite code, created on first read so the
		// invite screen always has a link to show.
		referralCode: t.field({
			type: "String",
			nullable: true,
			resolve: async (user, _args, ctx) =>
				canSeePrivate(ctx, user.id)
					? (await getOrCreateReferralCode(user.id)).code
					: null,
		}),
		// How the invites this user has sent are doing. `waiting` is the one
		// worth surfacing: those are redos already earned that the balance cap
		// is holding back until they spend one.
		referralStats: t.field({
			type: ReferralStatsRef,
			nullable: true,
			resolve: (user, _args, ctx) =>
				canSeePrivate(ctx, user.id) ? referralStatsFor(user.id) : null,
		}),
		createdAt: t.field({
			type: "DateTime",
			resolve: (user) => user.createdAt,
		}),
		// The one chip shown beside this user's name site-wide. Null for an
		// account that hasn't picked one, which is every account until it does.
		equippedFlair: t.relation("equippedFlair", { nullable: true }),
		// Only what this user was GIVEN, newest first. Not what they can equip:
		// every team flair is open to everyone with no row behind it, so the
		// picker reads the myFlairs query instead.
		grantedFlairs: t.loadableList({
			type: FlairRef,
			load: async (userIds: string[]) => {
				const rows = await db.query.userFlairs.findMany({
					where: { userId: { in: userIds } },
					orderBy: { grantedAt: "desc" },
					with: { flair: true },
				})
				return groupByKey(userIds, rows, (row) => row.userId).map((grants) =>
					grants.flatMap((grant) => (grant.flair ? [grant.flair] : [])),
				)
			},
			resolve: (user) => user.id,
		}),
		// Null on a brand new account, which is what makes the get-started
		// checklist appear. Read straight off the Me query into router context,
		// so any component can check it without a request of its own.
		onboardingDismissedAt: t.field({
			type: "DateTime",
			nullable: true,
			resolve: (user) => user.onboardingDismissedAt,
		}),
		// Set means the checklist renders as a single collapsed row instead of
		// the full card. Independent of the dismissal above: collapsed is a
		// display choice, dismissed is the card being gone.
		onboardingCollapsedAt: t.field({
			type: "DateTime",
			nullable: true,
			resolve: (user) => user.onboardingCollapsedAt,
		}),
		// null until this user has made a single call site-wide
		careerStats: t.field({
			type: UserCareerStatsRef,
			nullable: true,
			resolve: async (user, _args, ctx) => {
				// No league, no season scope - a career total is exactly the
				// unfiltered board, and stays that way as the leaderboard itself
				// moves to defaulting to the current season.
				const entries = await getGlobalLeaderboard(ctx, null, ALL_TIME)
				return entries.find((entry) => entry.user.id === user.id) ?? null
			},
		}),
		leagues: t.field({
			type: [UserLeagueStatsRef],
			resolve: (user, _args, ctx) =>
				buildUserLeagueStats(user.id, (leagueId) =>
					getGlobalLeaderboard(ctx, leagueId, ALL_TIME),
				),
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
		// Every league-and-family track whose best run reached
		// LISTED_STREAK_MIN, hottest first.
		streaks: t.field({
			type: [UserStreakRef],
			resolve: (user) =>
				db.query.userStreaks.findMany({
					where: { userId: user.id, bestLength: { gte: LISTED_STREAK_MIN } },
					orderBy: { currentLength: "desc", bestLength: "desc" },
				}),
		}),
		// Every track the user is currently cold on, coldest first. Separate
		// from streaks above rather than a filter over it: a track that has
		// only ever missed has a bestLength of 0, so it never clears that
		// field's LISTED_STREAK_MIN.
		coldStreaks: t.field({
			type: [UserStreakRef],
			resolve: (user) =>
				db.query.userStreaks.findMany({
					where: {
						userId: user.id,
						currentColdLength: { gte: COLD_STREAK_MIN },
					},
					orderBy: { currentColdLength: "desc", worstColdLength: "desc" },
				}),
		}),
		streak: t.field({
			type: UserStreakRef,
			nullable: true,
			args: {
				league: t.arg.string({ required: true }),
				family: t.arg({ type: StreakFamilyEnum, required: true }),
			},
			resolve: async (user, args, ctx) => {
				const league = await findLeague(ctx, { slug: args.league })
				if (!league) return null
				return db.query.userStreaks.findFirst({
					where: { userId: user.id, leagueId: league.id, family: args.family },
				})
			},
		}),
		// Newest first.
		sweeps: t.field({
			type: [UserSweepRef],
			args: { limit: t.arg.int({ required: false }) },
			resolve: (user, args) =>
				db.query.userSweeps.findMany({
					where: { userId: user.id },
					orderBy: { settledAt: "desc" },
					limit: Math.min(Math.max(args.limit ?? MAX_SWEEPS, 1), MAX_SWEEPS),
				}),
		}),
		sweep: t.field({
			type: UserSweepRef,
			nullable: true,
			args: {
				league: t.arg.string({ required: true }),
				slateKey: t.arg.string({ required: true }),
			},
			resolve: async (user, args, ctx) => {
				const league = await findLeague(ctx, { slug: args.league })
				if (!league) return null
				return db.query.userSweeps.findFirst({
					where: {
						userId: user.id,
						leagueId: league.id,
						slateKey: args.slateKey,
					},
				})
			},
		}),
		// This user's calls across one window of games. Null only when the
		// league or the window key names nothing - a window they made no calls
		// in still returns a card, carrying that window's label and zeroes, so
		// the permalink can say which window it found nothing for.
		reportCard: t.field({
			type: ReportCardRef,
			nullable: true,
			args: {
				league: t.arg.string({ required: true }),
				windowKey: t.arg.string({ required: true }),
			},
			resolve: async (user, args, ctx) => {
				const league = await findLeague(ctx, { slug: args.league })
				if (!league) return null
				const window = await resolveWindowByKey(league, args.windowKey)
				if (!window) return null
				return loadReportCardResult(user.id, league, window)
			},
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
			type: "DateTime",
			resolve: (v) => v.createdAt,
		}),
		voidedByAdmin: t.relation("voidedByAdmin", { nullable: true }),
	}),
})
