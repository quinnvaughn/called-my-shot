import { db } from "../../../db"
import { mutedEmailTypes } from "../../../lib/email-prefs"
import {
	buildGlobalLeaderboard,
	type LeaderboardEntry,
} from "../../../lib/global-leaderboard"
import { builder } from "../../builder"
import { CallRef, VoidReason } from "../question"
import { EmailPreferenceType } from "./enums"
import { buildUserLeagueStats, UserLeagueStatsRef } from "./stats"

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
		// Non-null means mail we sent to this address came back permanently
		// (see lib/email-bounce.ts). Drives the site-wide banner asking them to
		// fix it - unrelated to emailVerified, which is only about whether the
		// address was ever confirmed.
		emailBouncedAt: t.field({
			type: "String",
			nullable: true,
			resolve: (user) => user.emailBouncedAt?.toISOString() ?? null,
		}),
		// The types this user has MUTED - absence of a row is the subscribed
		// state (see db/schema/email.ts), so an empty list means "everything
		// on", which is what a brand new account gets without any backfill.
		mutedEmailTypes: t.field({
			type: [EmailPreferenceType],
			resolve: (user) => mutedEmailTypes(user.id),
		}),
		createdAt: t.field({
			type: "String",
			resolve: (user) => user.createdAt.toISOString(),
		}),
		// Null on a brand new account, which is what makes the get-started
		// checklist appear. Read straight off the Me query into router context,
		// so any component can check it without a request of its own.
		onboardingDismissedAt: t.field({
			type: "String",
			nullable: true,
			resolve: (user) => user.onboardingDismissedAt?.toISOString() ?? null,
		}),
		// Set means the checklist renders as a single collapsed row instead of
		// the full card. Independent of the dismissal above: collapsed is a
		// display choice, dismissed is the card being gone.
		onboardingCollapsedAt: t.field({
			type: "String",
			nullable: true,
			resolve: (user) => user.onboardingCollapsedAt?.toISOString() ?? null,
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
