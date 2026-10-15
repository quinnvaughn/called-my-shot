import { seriesStageWeight } from "@called-my-shot/scoring"
import { eq } from "drizzle-orm"
import { match } from "ts-pattern"
import { postseasonSeries, questionOptions, questions } from "../../db/schema"
import type { DbOrTx, Tx } from "../../db/types"
import { pricedSide } from "../game-questions/duel-pricing"
import {
	isGameConfirmed,
	lastAskableGame,
	type SeriesGameChances,
	seriesOutlook,
	seriesStage,
	seriesWinner,
} from "./series"
import {
	loadSeriesGames,
	SERIES_DISTANCE_TEMPLATE,
	SERIES_WINNER_TEMPLATE,
} from "./settle"

export type SeriesTemplate = "winner" | "distance"

export function seriesTemplateOf(
	generationKey: string | null,
): SeriesTemplate | null {
	return match(generationKey?.split(":").at(-1))
		.with(SERIES_WINNER_TEMPLATE, () => "winner" as const)
		.with(SERIES_DISTANCE_TEMPLATE, () => "distance" as const)
		.otherwise(() => null)
}

// Where an undecided series stands between two of its games: how many are
// final, and the next one, which a series question takes calls until. Null
// while a game is being played, once the series is decided, and when the next
// game has no real start time yet or might never be played.
export type SeriesWindow = {
	gamesPlayed: number
	nextGameNumber: number
	locksAt: Date
}

export async function seriesWindow(
	executor: DbOrTx,
	seriesId: string,
	now: Date,
): Promise<SeriesWindow | null> {
	const series = await executor.query.postseasonSeries.findFirst({
		where: { id: seriesId },
		columns: { bestOf: true, winnerTeamId: true },
	})
	if (!series?.bestOf || series.winnerTeamId) return null
	const games = await loadSeriesGames(executor, seriesId)
	if (seriesWinner(games, series.bestOf)) return null
	const { gamesPlayed, nextGameNumber } = seriesStage(games)
	const next = games.find((g) => g.seriesGameNumber === nextGameNumber)
	if (
		!next ||
		next.status !== "scheduled" ||
		next.startsAt <= now ||
		!isGameConfirmed(next, games, series.bestOf)
	) {
		return null
	}
	const timing = await executor.query.games.findFirst({
		where: { id: next.id },
		columns: { startTimeTbd: true },
	})
	if (!timing || timing.startTimeTbd) return null
	return { gamesPlayed, nextGameNumber, locksAt: next.startsAt }
}

// Whether a series question still takes calls before the given game.
export function isAskableBefore(
	template: SeriesTemplate,
	bestOf: number,
	gameNumber: number,
): boolean {
	return gameNumber <= lastAskableGame(template, bestOf)
}

// Opens each of a series' unsettled questions for calls until its next game
// starts, priced from where the series stands now. Between games is the only
// time they take calls: each one locks when a game starts (lockOverdueQuestions
// flips it) and opens again here once that game is final, until the last game
// it can be asked before. Its sides move every time, and every pick keeps the
// price it was made at (see callSelections.lossRate), so nobody already in
// gains or loses from the move. Run whenever a series game goes final and on
// the daily sync, which also refreshes the per-game chances the prices come
// from.
export async function refreshSeriesQuestions(
	tx: Tx,
	seriesId: string,
	now: Date = new Date(),
): Promise<void> {
	const window = await seriesWindow(tx, seriesId, now)
	if (!window) return
	const series = await tx.query.postseasonSeries.findFirst({
		where: { id: seriesId },
	})
	if (!series?.bestOf) return
	const bestOf = series.bestOf

	// Without a model read, every game is a coin flip: the series score
	// still prices the sides, which is most of what moves them.
	const chances: SeriesGameChances = {
		teamAId: series.teamAId,
		teamAHome: series.teamAHomeWinChance ?? 0.5,
		teamBHome: series.teamBHomeWinChance ?? 0.5,
	}
	const games = await loadSeriesGames(tx, seriesId)
	const outlook = seriesOutlook(games, bestOf, series.teamBId, chances)

	const open = await tx.query.questions.findMany({
		where: { seriesId, status: { in: ["open", "locked"] } },
		with: { options: true },
	})
	for (const question of open) {
		const template = seriesTemplateOf(question.generationKey)
		if (!template || !isAskableBefore(template, bestOf, window.nextGameNumber)) {
			continue
		}
		for (const option of question.options) {
			const chance = match(template)
				.with("winner", () =>
					option.teamId === series.teamAId
						? outlook.teamAWins
						: 1 - outlook.teamAWins,
				)
				.with("distance", () =>
					option.label === "Yes"
						? outlook.goesDistance
						: 1 - outlook.goesDistance,
				)
				.exhaustive()
			await tx
				.update(questionOptions)
				.set(pricedSide(chance))
				.where(eq(questionOptions.id, option.id))
		}
		await tx
			.update(questions)
			.set({ status: "open", locksAt: window.locksAt })
			.where(eq(questions.id, question.id))
	}
}

// What a call made now on a series question is worth (see
// seriesStageWeight), read off the series' final games.
export async function seriesCallStage(
	executor: DbOrTx,
	seriesId: string,
): Promise<{ seriesGamesPlayed: number; seriesWeight: number } | null> {
	const series = await executor.query.postseasonSeries.findFirst({
		where: { id: seriesId },
		columns: { bestOf: true },
	})
	if (!series?.bestOf) return null
	const { gamesPlayed } = seriesStage(await loadSeriesGames(executor, seriesId))
	return {
		seriesGamesPlayed: gamesPlayed,
		seriesWeight: seriesStageWeight(gamesPlayed, series.bestOf),
	}
}

// Stores the chance each team wins a home game in the series, which every
// later reprice reads.
export async function saveSeriesGameChances(
	tx: Tx,
	seriesId: string,
	chances: { teamAHome: number; teamBHome: number },
): Promise<void> {
	await tx
		.update(postseasonSeries)
		.set({
			teamAHomeWinChance: chances.teamAHome,
			teamBHomeWinChance: chances.teamBHome,
		})
		.where(eq(postseasonSeries.id, seriesId))
}
