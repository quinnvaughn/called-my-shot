import { and, eq, inArray } from "drizzle-orm"
import { match } from "ts-pattern"
import { db } from "../../db"
import { games, postseasonSeries } from "../../db/schema"
import type { Tx } from "../../db/types"
import { resolveQuestionInternal } from "../resolve-question"
import { markQuestionVoided } from "../void-question"
import {
	decidingGameNumber,
	isGameConfirmed,
	type SeriesGame,
	seriesTeamPair,
	seriesWinner,
	unplayedGames,
} from "./series"

// The last part of a series question's generationKey, which is how settling
// tells the two apart - see db/sync/sync-series-questions.ts.
export const SERIES_WINNER_TEMPLATE = "series_winner"
export const SERIES_DISTANCE_TEMPLATE = "series_distance"

const UNPLAYED_NOTE =
	"Voided automatically: the series ended before this game was needed."

// The series a postseason game belongs to, created the first time one of its
// games is synced. Its length is filled in separately, from ESPN's scoreboard
// (see fillSeriesLengths in db/sync/sync-games.ts).
export async function findOrCreateSeries(
	tx: Tx,
	input: {
		leagueId: string
		seasonId: string
		round: string
		homeTeamId: string
		awayTeamId: string
	},
): Promise<string> {
	const [teamAId, teamBId] = seriesTeamPair(input.homeTeamId, input.awayTeamId)
	const existing = await tx.query.postseasonSeries.findFirst({
		where: { seasonId: input.seasonId, round: input.round, teamAId, teamBId },
	})
	if (existing) return existing.id
	const [row] = await tx
		.insert(postseasonSeries)
		.values({
			leagueId: input.leagueId,
			seasonId: input.seasonId,
			round: input.round,
			teamAId,
			teamBId,
		})
		.returning({ id: postseasonSeries.id })
	if (!row) throw new Error("findOrCreateSeries: insert returned nothing")
	return row.id
}

export function loadSeriesGames(
	executor: Tx | typeof db,
	seriesId: string,
): Promise<SeriesGame[]> {
	return executor.query.games.findMany({
		where: { seriesId },
		columns: {
			id: true,
			status: true,
			homeTeamId: true,
			awayTeamId: true,
			homeScore: true,
			awayScore: true,
			seriesGameNumber: true,
			ifNecessary: true,
			startsAt: true,
		},
		orderBy: { seriesGameNumber: "asc" },
	})
}

// Whether anything should be asked about a game yet: its start time has to be
// a real one, and a series game has to be one the series will actually play
// (see isGameConfirmed).
export async function isGameAskable(game: {
	startTimeTbd: boolean
	ifNecessary: boolean
	seriesId: string | null
	seriesGameNumber: number | null
}): Promise<boolean> {
	if (game.startTimeTbd) return false
	if (!game.seriesId) return true
	const series = await db.query.postseasonSeries.findFirst({
		where: { id: game.seriesId },
		columns: { bestOf: true },
	})
	const seriesGames = await loadSeriesGames(db, game.seriesId)
	return isGameConfirmed(game, seriesGames, series?.bestOf ?? null)
}

// Records a series' winner once its final games show one, then clears out
// what the result makes moot: the games it never needed (each question on
// them voided, then the game deleted) and its own series questions, which
// settle here. Safe to run again on a decided series - the games are gone
// and the questions are no longer open, so a rerun finds nothing to do.
export async function settleSeries(
	tx: Tx,
	seriesId: string,
	now: Date = new Date(),
): Promise<void> {
	const [series] = await tx
		.select()
		.from(postseasonSeries)
		.where(eq(postseasonSeries.id, seriesId))
		.for("update")
	if (!series) return

	const seriesGames = await loadSeriesGames(tx, seriesId)
	const winnerTeamId = seriesWinner(seriesGames, series.bestOf)
	if (!winnerTeamId) return

	if (series.winnerTeamId !== winnerTeamId) {
		await tx
			.update(postseasonSeries)
			.set({ winnerTeamId, decidedAt: series.decidedAt ?? now })
			.where(eq(postseasonSeries.id, seriesId))
	}

	const unplayedIds = unplayedGames(seriesGames, series.bestOf).map((g) => g.id)
	if (unplayedIds.length > 0) {
		const stranded = await tx.query.questions.findMany({
			where: {
				gameId: { in: unplayedIds },
				status: { in: ["open", "locked"] },
			},
		})
		for (const question of stranded) {
			await markQuestionVoided(tx, question, {
				reason: "game_not_completed",
				note: UNPLAYED_NOTE,
				voidedBy: { method: "system" },
			})
		}
		// The game's external ref stays behind on purpose: while ESPN keeps
		// listing the event, the next sync finds the ref, updates nothing, and
		// so never recreates the game.
		await tx
			.delete(games)
			.where(and(eq(games.seriesId, seriesId), inArray(games.id, unplayedIds)))
		console.log(
			`[postseason] series ${seriesId}: removed ${unplayedIds.length} unplayed game(s)`,
		)
	}

	const deciding = decidingGameNumber(seriesGames, series.bestOf)
	const open = await tx.query.questions.findMany({
		where: { seriesId, status: { in: ["open", "locked"] } },
		with: { options: true },
	})
	for (const question of open) {
		const correct = match(question.generationKey?.split(":").at(-1))
			.with(SERIES_WINNER_TEMPLATE, () =>
				question.options.find((o) => o.teamId === winnerTeamId),
			)
			.with(SERIES_DISTANCE_TEMPLATE, () =>
				question.options.find(
					(o) => o.label === (deciding === series.bestOf ? "Yes" : "No"),
				),
			)
			.otherwise(() => undefined)
		if (!correct) continue
		await resolveQuestionInternal(
			tx,
			question,
			{
				correctOptionIds: [correct.id],
				resolutionNote: "Resolved automatically from ESPN's final scores.",
			},
			{ resolvedBy: { method: "system" } },
		)
		console.log(`[postseason] resolved series question ${question.id}`)
	}
}
