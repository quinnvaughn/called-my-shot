import { db } from "../../../db"
import type { Game, PostseasonSeries, Question } from "../../../db/schema"
import { loadPlayoffSeeds } from "../../../lib/postseason/seeds"
import {
	isGameConfirmed,
	roundLabel,
	type SeriesGame,
	seriesSummary,
	standingBefore,
} from "../../../lib/postseason/series"
import { builder } from "../../builder"
import { ctxLoader, indexByKey } from "../../loader"
import { QuestionRef } from "../question/question-object"

type SeriesBundle = {
	series: PostseasonSeries
	games: SeriesGame[]
	abbreviationByTeamId: Map<string, string>
	questions: Question[]
}

// Everything a game's postseason fields read about its series, one query per
// kind for a whole Games tab of series games rather than per row.
const seriesLoader = ctxLoader(async (seriesIds: string[]) => {
	const [seriesRows, seriesGames, seriesQuestions] = await Promise.all([
		db.query.postseasonSeries.findMany({ where: { id: { in: seriesIds } } }),
		db.query.games.findMany({
			where: { seriesId: { in: seriesIds } },
			columns: {
				id: true,
				seriesId: true,
				status: true,
				homeTeamId: true,
				awayTeamId: true,
				homeScore: true,
				awayScore: true,
				seriesGameNumber: true,
				ifNecessary: true,
				startsAt: true,
			},
		}),
		db.query.questions.findMany({
			where: { seriesId: { in: seriesIds }, isOfficial: true },
			orderBy: { createdAt: "asc", id: "asc" },
		}),
	])
	const teamIds = [
		...new Set(seriesRows.flatMap((s) => [s.teamAId, s.teamBId])),
	]
	const teams = teamIds.length
		? await db.query.teams.findMany({
				where: { id: { in: teamIds } },
				columns: { id: true, abbreviation: true },
			})
		: []
	const abbreviationByTeamId = new Map(teams.map((t) => [t.id, t.abbreviation]))
	const bundles = seriesRows.map(
		(series): SeriesBundle => ({
			series,
			games: seriesGames.filter((g) => g.seriesId === series.id),
			abbreviationByTeamId,
			questions: seriesQuestions.filter((q) => q.seriesId === series.id),
		}),
	)
	return indexByKey(seriesIds, bundles, (b) => b.series.id, null)
})

// Batched by "teamId|seasonId" so a Games tab's worth of playoff games reads
// every seed in one query.
export const playoffSeedLoader = ctxLoader(loadPlayoffSeeds)

type GamePostseason = { game: Game; bundle: SeriesBundle | null }

export const GamePostseasonRef = builder
	.objectRef<GamePostseason>("GamePostseason")
	.implement({
		description:
			"Where a postseason game sits: its round, and for a series game, how the series stands.",
		fields: (t) => ({
			roundLabel: t.string({
				resolve: ({ game }) => roundLabel(game.postseasonRound ?? ""),
			}),
			// Each side's playoff seed within its own league or conference. Null
			// until a standings reading has one.
			homeSeed: t.int({
				nullable: true,
				resolve: ({ game }, _args, ctx) =>
					playoffSeedLoader(ctx).load(`${game.homeTeamId}|${game.seasonId}`),
			}),
			awaySeed: t.int({
				nullable: true,
				resolve: ({ game }, _args, ctx) =>
					playoffSeedLoader(ctx).load(`${game.awayTeamId}|${game.seasonId}`),
			}),
			// Null outside a series.
			gameNumber: t.int({
				nullable: true,
				resolve: ({ game }) => game.seriesGameNumber,
			}),
			// Null until ESPN's postseason scoreboard has been read for it.
			bestOf: t.int({
				nullable: true,
				resolve: ({ bundle }) => bundle?.series.bestOf ?? null,
			}),
			// Whether this game may still not be played: ESPN flagged it "If
			// Necessary" and the series hasn't reached it yet.
			ifNecessary: t.boolean({
				resolve: ({ game, bundle }) =>
					game.ifNecessary &&
					!isGameConfirmed(
						game,
						bundle?.games ?? [],
						bundle?.series.bestOf ?? null,
					),
			}),
			// "NYY leads 2-1" going into the game, or after it once it's final.
			summary: t.string({
				nullable: true,
				resolve: ({ game, bundle }) =>
					bundle
						? seriesSummary(
								game,
								bundle.games,
								bundle.series.bestOf,
								(teamId) => bundle.abbreviationByTeamId.get(teamId) ?? "",
							)
						: null,
			}),
			// The teams that win the series by winning this game - one for an
			// elimination game, both for a winner-take-all one. Empty once the
			// game is final.
			clinchTeamIds: t.idList({
				resolve: ({ game, bundle }) =>
					bundle && game.status !== "final"
						? standingBefore(game, bundle.games, bundle.series.bestOf)
								.clinchTeamIds
						: [],
			}),
			// The series' own official questions (who wins it, whether it goes the
			// distance), which every game of the series shows.
			seriesQuestions: t.field({
				type: [QuestionRef],
				resolve: ({ bundle }) => bundle?.questions ?? [],
			}),
		}),
	})

export async function loadGamePostseason(
	game: Game,
	ctx: Parameters<typeof seriesLoader>[0],
): Promise<GamePostseason | null> {
	if (game.seasonType !== "postseason" || !game.postseasonRound) return null
	const bundle = game.seriesId
		? await seriesLoader(ctx).load(game.seriesId)
		: null
	return { game, bundle }
}
