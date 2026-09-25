import { db } from "../../../db"
import { roundLabel, seriesSummary } from "../../../lib/postseason/series"
import { loadSeriesGames } from "../../../lib/postseason/settle"
import { builder } from "../../builder"
import { GameRef } from "./game"
import { playoffSeedLoader } from "./postseason"

const SeriesSeedRef = builder
	.objectRef<{ teamId: string; seed: number }>("SeriesSeed")
	.implement({
		fields: (t) => ({
			teamId: t.exposeID("teamId"),
			seed: t.exposeInt("seed"),
		}),
	})

// A postseason series, as a series question shows it: the round, its two
// teams (through Game 1, whose away/home order the question's options follow)
// and where it stands. Per-row resolves - a list of questions carries only a
// handful of series ones.
export const PostseasonSeriesRef = builder.drizzleObject("postseasonSeries", {
	name: "PostseasonSeries",
	fields: (t) => ({
		id: t.exposeID("id"),
		roundLabel: t.string({ resolve: (s) => roundLabel(s.round) }),
		// Null until ESPN's scoreboard has been read for it.
		bestOf: t.exposeInt("bestOf", { nullable: true }),
		gameOne: t.field({
			type: GameRef,
			nullable: true,
			resolve: async (s) =>
				(await db.query.games.findFirst({
					where: { seriesId: s.id, seriesGameNumber: 1 },
				})) ?? null,
		}),
		// Each team's playoff seed, keyed by team so the side a seed belongs to
		// doesn't depend on Game 1's home/away order.
		seeds: t.field({
			type: [SeriesSeedRef],
			resolve: async (s, _args, ctx) => {
				const teamIds = [s.teamAId, s.teamBId]
				const seeds = await playoffSeedLoader(ctx).loadMany(
					teamIds.map((teamId) => `${teamId}|${s.seasonId}`),
				)
				return teamIds.flatMap((teamId, i) => {
					const seed = seeds[i]
					return typeof seed === "number" ? [{ teamId, seed }] : []
				})
			},
		}),
		// Where the series stands after its latest final game ("NYL leads
		// 1-0", "MIN wins series 2-1"), or "Best of 3" before it starts.
		summary: t.string({
			nullable: true,
			resolve: async (s) => {
				const games = await loadSeriesGames(db, s.id)
				const latest = games.filter((g) => g.status === "final").at(-1)
				if (!latest) return s.bestOf ? `Best of ${s.bestOf}` : null
				const teams = await db.query.teams.findMany({
					where: { id: { in: [s.teamAId, s.teamBId] } },
					columns: { id: true, abbreviation: true },
				})
				return seriesSummary(
					latest,
					games,
					s.bestOf,
					(teamId) => teams.find((t) => t.id === teamId)?.abbreviation ?? "",
				)
			},
		}),
	}),
})
