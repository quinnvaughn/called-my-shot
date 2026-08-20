import { sql } from "drizzle-orm"
import type { db } from "../db"
import { userLeagueStats } from "../db/schema"

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export type LeagueStatDelta = {
	points: number
	resolvedCallCount: number
	correctCount: number
	callCount: number
}

const ZERO_DELTA: LeagueStatDelta = {
	points: 0,
	resolvedCallCount: 0,
	correctCount: 0,
	callCount: 0,
}

// Accumulates a per-user delta into `map` (in place) rather than replacing
// it, so a caller can fold several calls/selections worth of change into one
// entry per user before applying anything to the DB.
export function addLeagueStatDelta(
	map: Map<string, LeagueStatDelta>,
	userId: string,
	delta: Partial<LeagueStatDelta>,
) {
	const existing = map.get(userId) ?? { ...ZERO_DELTA }
	map.set(userId, {
		points: existing.points + (delta.points ?? 0),
		resolvedCallCount:
			existing.resolvedCallCount + (delta.resolvedCallCount ?? 0),
		correctCount: existing.correctCount + (delta.correctCount ?? 0),
		callCount: existing.callCount + (delta.callCount ?? 0),
	})
}

// Applies accumulated deltas to user_league_stats for one league - every
// delta here shares the same leagueId because a question (and therefore
// every call on it) belongs to exactly one league. Upserts rather than
// updates: the first time a user has any activity in a league there's no
// row yet, so `points = points + delta` alone would silently no-op instead
// of creating one.
export async function applyLeagueStatDeltas(
	tx: Tx,
	leagueId: string,
	deltas: Map<string, LeagueStatDelta>,
) {
	for (const [userId, delta] of deltas) {
		if (
			delta.points === 0 &&
			delta.resolvedCallCount === 0 &&
			delta.correctCount === 0 &&
			delta.callCount === 0
		) {
			continue
		}
		await tx
			.insert(userLeagueStats)
			.values({
				userId,
				leagueId,
				points: delta.points,
				resolvedCallCount: delta.resolvedCallCount,
				correctCount: delta.correctCount,
				callCount: delta.callCount,
			})
			.onConflictDoUpdate({
				target: [userLeagueStats.userId, userLeagueStats.leagueId],
				set: {
					points: sql`${userLeagueStats.points} + ${delta.points}`,
					resolvedCallCount: sql`${userLeagueStats.resolvedCallCount} + ${delta.resolvedCallCount}`,
					correctCount: sql`${userLeagueStats.correctCount} + ${delta.correctCount}`,
					callCount: sql`${userLeagueStats.callCount} + ${delta.callCount}`,
				},
			})
	}
}
