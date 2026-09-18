import {
	COLD_STREAK_MIN,
	HOT_STREAK_MIN,
	STREAK_FAMILY_LABEL,
} from "@called-my-shot/scoring"
import { db } from "../../../db"
import type { League, User, UserStreak, UserSweep } from "../../../db/schema"
import { getTrackedLeagueIds } from "../../../lib/groups"
import { formatSlateLabel, parseSlateKey } from "../../../lib/streaks/slate"
import { builder } from "../../builder"
import type { Context } from "../../context"
import { LeagueRef } from "../sports"
import { StreakFamilyEnum, UserRef } from "../user"
import { getMemberUserIds } from "./leaderboard"

// The most any one list hands back, however large the group. The band on the
// group page asks for three; the sheet behind its "see all" asks for this.
const MAX_HIGHLIGHTS = 50

export type GroupStreakEntry = {
	user: User
	league: League
	streak: UserStreak
}
export type GroupSweepEntry = { user: User; league: League; sweep: UserSweep }

// Named streak/sweep types of their own rather than a `user` field added to
// UserStreak/UserSweep: same reasoning as GroupLeaderboardEntry, and it keeps
// the group lists from having to hand a partially loaded relation to a
// drizzleObject (see the note atop lib/streaks/read.ts).
export const GroupStreakEntryRef = builder
	.objectRef<GroupStreakEntry>("GroupStreakEntry")
	.implement({
		fields: (t) => ({
			user: t.field({ type: UserRef, resolve: (e) => e.user }),
			league: t.field({ type: LeagueRef, resolve: (e) => e.league }),
			family: t.field({
				type: StreakFamilyEnum,
				resolve: (e) => e.streak.family,
			}),
			familyLabel: t.field({
				type: "String",
				resolve: (e) => STREAK_FAMILY_LABEL[e.streak.family],
			}),
			currentLength: t.int({ resolve: (e) => e.streak.currentLength }),
			bestLength: t.int({ resolve: (e) => e.streak.bestLength }),
			currentColdLength: t.int({ resolve: (e) => e.streak.currentColdLength }),
			worstColdLength: t.int({ resolve: (e) => e.streak.worstColdLength }),
		}),
	})

export const GroupSweepEntryRef = builder
	.objectRef<GroupSweepEntry>("GroupSweepEntry")
	.implement({
		fields: (t) => ({
			user: t.field({ type: UserRef, resolve: (e) => e.user }),
			league: t.field({ type: LeagueRef, resolve: (e) => e.league }),
			slateKey: t.string({ resolve: (e) => e.sweep.slateKey }),
			// "Week 3 Sunday Early", "Sep 14" - reads after the league's
			// abbreviation, same as UserSweep.slateLabel.
			slateLabel: t.field({
				type: "String",
				resolve: (e) => {
					const slate = parseSlateKey(e.sweep.slateKey)
					return slate
						? formatSlateLabel(slate, e.league.slug)
						: e.sweep.slateKey
				},
			}),
			gameCount: t.int({ resolve: (e) => e.sweep.gameCount }),
			firstStartsAt: t.field({
				type: "String",
				resolve: (e) => e.sweep.firstStartsAt.toISOString(),
			}),
			settledAt: t.field({
				type: "String",
				resolve: (e) => e.sweep.settledAt.toISOString(),
			}),
		}),
	})

export type GroupHighlights = {
	hotStreaks: GroupStreakEntry[]
	coldStreaks: GroupStreakEntry[]
	streakRecords: GroupStreakEntry[]
	recentSweeps: GroupSweepEntry[]
}

const EMPTY: GroupHighlights = {
	hotStreaks: [],
	coldStreaks: [],
	streakRecords: [],
	recentSweeps: [],
}

// A group's tracked leagues bound its highlights the same way they bound its
// leaderboard. Unlike the leaderboard there's no league tab or season to
// narrow further: a streak has no season at all (a run carries across one), so
// a season filter could only ever apply to half of this.
async function buildHighlights(groupId: string): Promise<GroupHighlights> {
	const [memberIds, tracked] = await Promise.all([
		getMemberUserIds(groupId),
		getTrackedLeagueIds(groupId),
	])
	if (memberIds.length === 0) return EMPTY

	const scope = {
		userId: { in: memberIds },
		...(tracked ? { leagueId: { in: tracked } } : {}),
	}
	const [hot, cold, records, sweeps] = await Promise.all([
		db.query.userStreaks.findMany({
			where: { ...scope, currentLength: { gte: HOT_STREAK_MIN } },
			orderBy: { currentLength: "desc", lastSettledAt: "desc" },
			limit: MAX_HIGHLIGHTS,
		}),
		db.query.userStreaks.findMany({
			where: { ...scope, currentColdLength: { gte: COLD_STREAK_MIN } },
			orderBy: { currentColdLength: "desc", lastSettledAt: "desc" },
			limit: MAX_HIGHLIGHTS,
		}),
		db.query.userStreaks.findMany({
			where: { ...scope, bestLength: { gte: HOT_STREAK_MIN } },
			orderBy: { bestLength: "desc", bestEndedAt: "desc" },
			limit: MAX_HIGHLIGHTS,
		}),
		db.query.userSweeps.findMany({
			where: scope,
			orderBy: { settledAt: "desc" },
			limit: MAX_HIGHLIGHTS,
		}),
	])

	// One read each for the names and the league tags every row carries,
	// rather than a per-row resolve on four lists of up to 50.
	const rows = [...hot, ...cold, ...records, ...sweeps]
	const [users, leagues] = await Promise.all([
		db.query.users.findMany({
			where: { id: { in: [...new Set(rows.map((r) => r.userId))] } },
		}),
		db.query.leagues.findMany({
			where: { id: { in: [...new Set(rows.map((r) => r.leagueId))] } },
		}),
	])
	const userById = new Map(users.map((u) => [u.id, u]))
	const leagueById = new Map(leagues.map((l) => [l.id, l]))

	// A member removed from the group between the two reads drops out rather
	// than resolving to a null user.
	function join<T extends { userId: string; leagueId: string }, R>(
		list: T[],
		make: (user: User, league: League, row: T) => R,
	): R[] {
		return list.flatMap((row) => {
			const user = userById.get(row.userId)
			const league = leagueById.get(row.leagueId)
			return user && league ? [make(user, league, row)] : []
		})
	}
	const streakEntry = (user: User, league: League, streak: UserStreak) => ({
		user,
		league,
		streak,
	})

	return {
		hotStreaks: join(hot, streakEntry),
		coldStreaks: join(cold, streakEntry),
		streakRecords: join(records, streakEntry),
		recentSweeps: join(sweeps, (user, league, sweep) => ({
			user,
			league,
			sweep,
		})),
	}
}

// Single-flight per request, same pattern and same reason as
// getGroupLeaderboard: the four fields below all come off one group page load
// and would otherwise each re-read the roster and the tracked leagues. No
// league or season in the key because nothing narrows this (see
// buildHighlights).
export function getGroupHighlights(
	ctx: Context,
	groupId: string,
): Promise<GroupHighlights> {
	let cached = ctx.groupHighlightsCache.get(groupId)
	if (!cached) {
		cached = buildHighlights(groupId)
		ctx.groupHighlightsCache.set(groupId, cached)
	}
	return cached
}

export function clampHighlightLimit(limit: number | null | undefined): number {
	if (limit === null || limit === undefined) return MAX_HIGHLIGHTS
	return Math.max(1, Math.min(limit, MAX_HIGHLIGHTS))
}
