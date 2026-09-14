import { streakFamilyFor } from "@called-my-shot/scoring"
import { eq } from "drizzle-orm"
import {
	calls,
	type Question,
	streakRecomputeQueue,
	sweepRecomputeQueue,
} from "../../db/schema"
import type { Tx } from "../user-season-stats"
import { buildSlateKey } from "./slate"

// Whether a question's result can move a streak or a sweep: about one game,
// graded from ESPN data, and a shape with a streak family. A question its
// creator grades never counts, so nobody can grade their own way onto a
// streak. An admin correcting a system question still counts - it's the same
// ESPN-backed question with its result fixed.
export function countsTowardAchievements(
	question: Pick<Question, "gameId" | "resolutionMode" | "shape">,
): boolean {
	return (
		question.gameId !== null &&
		question.resolutionMode === "system" &&
		streakFamilyFor(question.shape) !== null
	)
}

// Marks every track and slate this question feeds as needing a rebuild.
// Called inside the transaction that settles, voids or deletes the question,
// so the mark commits with the change; lib/streaks/drain.ts does the rebuild
// afterwards, outside it. Must run before a hard delete, while the calls that
// say who to rebuild for still exist.
export async function markAchievementsDirty(
	tx: Tx,
	question: Question,
): Promise<void> {
	const family = streakFamilyFor(question.shape)
	if (!family || !question.gameId || !countsTowardAchievements(question)) {
		return
	}
	// Set here rather than by the column default: the drain compares this value
	// for equality, and now() carries microseconds a JS Date read back can't.
	const dirtiedAt = new Date()

	const callers = await tx
		.selectDistinct({ userId: calls.userId })
		.from(calls)
		.where(eq(calls.questionId, question.id))
	if (callers.length > 0) {
		await tx
			.insert(streakRecomputeQueue)
			.values(
				callers.map(({ userId }) => ({
					userId,
					leagueId: question.leagueId,
					family,
					dirtiedAt,
				})),
			)
			.onConflictDoUpdate({
				target: [
					streakRecomputeQueue.userId,
					streakRecomputeQueue.leagueId,
					streakRecomputeQueue.family,
				],
				set: { dirtiedAt },
			})
	}

	if (family !== "winners") return
	const slateKey = await slateKeyForGame(tx, question.gameId)
	if (!slateKey) return
	await tx
		.insert(sweepRecomputeQueue)
		.values({ leagueId: question.leagueId, slateKey, dirtiedAt })
		.onConflictDoUpdate({
			target: [sweepRecomputeQueue.leagueId, sweepRecomputeQueue.slateKey],
			set: { dirtiedAt },
		})
}

export async function slateKeyForGame(
	tx: Tx,
	gameId: string,
): Promise<string | null> {
	const game = await tx.query.games.findFirst({
		where: { id: gameId },
		columns: { startsAt: true, seasonType: true, weekNumber: true, slot: true },
		with: {
			league: { columns: { windowType: true } },
			season: { columns: { year: true } },
		},
	})
	if (!game?.league || !game.season) return null
	return buildSlateKey(game, game.league.windowType, game.season.year)
}
