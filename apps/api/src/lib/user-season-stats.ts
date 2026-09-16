import { sql } from "drizzle-orm"
import type { db } from "../db"
import { userSeasonStats } from "../db/schema"

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export type LeagueStatDelta = {
	points: number
	resolvedCallCount: number
	correctCount: number
	convictionSum: number
	convictionSumCorrect: number
	callCount: number
}

const ZERO_DELTA: LeagueStatDelta = {
	points: 0,
	resolvedCallCount: 0,
	correctCount: 0,
	convictionSum: 0,
	convictionSumCorrect: 0,
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
		convictionSum: existing.convictionSum + (delta.convictionSum ?? 0),
		convictionSumCorrect:
			existing.convictionSumCorrect + (delta.convictionSumCorrect ?? 0),
		callCount: existing.callCount + (delta.callCount ?? 0),
	})
}

// Applies accumulated deltas to user_season_stats for one season - every
// delta here shares the same leagueId/seasonId because a question (and
// therefore every call on it) belongs to exactly one season (questions.
// seasonId is NOT NULL). Upserts rather than updates: the first time a user
// has any activity in a season there's no row yet, so `points = points +
// delta` alone would silently no-op instead of creating one.
export async function applySeasonStatDeltas(
	tx: Tx,
	leagueId: string,
	seasonId: string,
	deltas: Map<string, LeagueStatDelta>,
) {
	for (const [userId, delta] of deltas) {
		// Every field zero means this user's row wouldn't change - skip the
		// round trip. Checked across the whole delta rather than field by field
		// so adding a field to LeagueStatDelta can't silently leave a hole here.
		if (Object.values(delta).every((value) => value === 0)) continue
		await tx
			.insert(userSeasonStats)
			.values({
				userId,
				leagueId,
				seasonId,
				points: delta.points,
				resolvedCallCount: delta.resolvedCallCount,
				correctCount: delta.correctCount,
				convictionSum: delta.convictionSum,
				convictionSumCorrect: delta.convictionSumCorrect,
				callCount: delta.callCount,
			})
			.onConflictDoUpdate({
				target: [userSeasonStats.userId, userSeasonStats.seasonId],
				set: {
					points: sql`${userSeasonStats.points} + ${delta.points}`,
					resolvedCallCount: sql`${userSeasonStats.resolvedCallCount} + ${delta.resolvedCallCount}`,
					correctCount: sql`${userSeasonStats.correctCount} + ${delta.correctCount}`,
					convictionSum: sql`${userSeasonStats.convictionSum} + ${delta.convictionSum}`,
					convictionSumCorrect: sql`${userSeasonStats.convictionSumCorrect} + ${delta.convictionSumCorrect}`,
					callCount: sql`${userSeasonStats.callCount} + ${delta.callCount}`,
				},
			})
	}
}
