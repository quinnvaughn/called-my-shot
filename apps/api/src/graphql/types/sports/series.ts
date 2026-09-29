import { and, eq, isNotNull, ne } from "drizzle-orm"
import { db } from "../../../db"
import {
	games,
	type League,
	type PostseasonSeries,
	type Season,
	type Team,
} from "../../../db/schema"
import {
	currentRounds,
	isEliminationGame,
	seasonPhase,
} from "../../../lib/postseason/current"
import {
	isGameConfirmed,
	roundLabel,
	type SeriesGame,
	seriesSummary,
	seriesWinner,
	seriesWins,
} from "../../../lib/postseason/series"
import { loadSeriesGames } from "../../../lib/postseason/settle"
import { getCurrentSeason } from "../../../lib/seasons"
import { getLeagueWindows, windowGameFilter } from "../../../lib/windows"
import { builder } from "../../builder"
import { type Context, ctxCache } from "../../context"
import { GameRef } from "./game"
import { LeagueRef } from "./league"
import { playoffSeedLoader, seriesLoader } from "./postseason"
import { TeamRef } from "./team"

const SeriesSeedRef = builder
	.objectRef<{ teamId: string; seed: number }>("SeriesSeed")
	.implement({
		fields: (t) => ({
			teamId: t.exposeID("teamId"),
			seed: t.exposeInt("seed"),
		}),
	})

type SeriesTeam = {
	team: Team
	seed: number | null
	wins: number
	eliminated: boolean
}

const SeriesTeamRef = builder.objectRef<SeriesTeam>("SeriesTeam").implement({
	fields: (t) => ({
		team: t.field({ type: TeamRef, resolve: (s) => s.team }),
		// Null until a standings reading has one.
		seed: t.exposeInt("seed", { nullable: true }),
		wins: t.exposeInt("wins"),
		// Lost the series.
		eliminated: t.exposeBoolean("eliminated"),
	}),
})

// The series' winner, from the settled column or, when a sync pass hasn't
// settled it yet, from its games.
function winnerOf(
	series: PostseasonSeries,
	seriesGames: SeriesGame[],
): string | null {
	return series.winnerTeamId ?? seriesWinner(seriesGames, series.bestOf)
}

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
		winnerTeamId: t.id({
			nullable: true,
			resolve: async (s, _args, ctx) => {
				const bundle = await seriesLoader(ctx).load(s.id)
				return winnerOf(s, bundle?.games ?? [])
			},
		}),
		// Both sides with their wins so far, the higher seed first. Seeds that
		// tie or aren't known yet fall back to Game 1's away-then-home order,
		// the same order the series question's options follow.
		teams: t.field({
			type: [SeriesTeamRef],
			resolve: async (s, _args, ctx) => {
				const bundle = await seriesLoader(ctx).load(s.id)
				const seriesGames = bundle?.games ?? []
				const winnerId = winnerOf(s, seriesGames)
				const wins = seriesWins(seriesGames)
				const teamIds = [s.teamAId, s.teamBId]
				const [teamRows, seeds] = await Promise.all([
					db.query.teams.findMany({ where: { id: { in: teamIds } } }),
					playoffSeedLoader(ctx).loadMany(
						teamIds.map((teamId) => `${teamId}|${s.seasonId}`),
					),
				])
				const gameOne = seriesGames.find((g) => g.seriesGameNumber === 1)
				const gameOneOrder = (teamId: string) =>
					gameOne ? (teamId === gameOne.awayTeamId ? 0 : 1) : 0
				return teamIds
					.flatMap((teamId, i): SeriesTeam[] => {
						const team = teamRows.find((row) => row.id === teamId)
						if (!team) return []
						const seed = seeds[i]
						return [
							{
								team,
								seed: typeof seed === "number" ? seed : null,
								wins: wins.get(teamId) ?? 0,
								eliminated: winnerId !== null && winnerId !== teamId,
							},
						]
					})
					.sort(
						(a, b) =>
							(a.seed ?? Number.POSITIVE_INFINITY) -
								(b.seed ?? Number.POSITIVE_INFINITY) ||
							gameOneOrder(a.team.id) - gameOneOrder(b.team.id),
					)
			},
		}),
		// The game a series points at: the one in progress or up next while
		// the series is on, the last one played once it's over. Null before
		// any game has synced.
		spotlightGame: t.field({
			type: GameRef,
			nullable: true,
			resolve: async (s, _args, ctx) => {
				const bundle = await seriesLoader(ctx).load(s.id)
				const seriesGames = [...(bundle?.games ?? [])].sort(
					(a, b) =>
						(a.seriesGameNumber ?? 0) - (b.seriesGameNumber ?? 0) ||
						a.startsAt.getTime() - b.startsAt.getTime(),
				)
				const upcoming = winnerOf(s, seriesGames)
					? undefined
					: seriesGames.find(
							(g) =>
								g.status !== "final" &&
								isGameConfirmed(g, seriesGames, s.bestOf),
						)
				const pick =
					upcoming ?? seriesGames.filter((g) => g.status === "final").at(-1)
				if (!pick) return null
				return (
					(await db.query.games.findFirst({ where: { id: pick.id } })) ?? null
				)
			},
		}),
	}),
})

type LeaguePostseason = { league: League; season: Season }

type CurrentRoundSeries = { roundCodes: string[]; series: PostseasonSeries[] }

// The current season's series in the rounds being played now (see
// currentRounds), ordered by round and then by each series' first game.
// Shared across a request, since the round labels and the series list both
// read it.
function loadCurrentRoundSeries(
	ctx: Context,
	seasonId: string,
): Promise<CurrentRoundSeries> {
	return ctxCache(ctx, `currentRoundSeries:${seasonId}`, async () => {
		const rows = await db.query.postseasonSeries.findMany({
			where: { seasonId },
		})
		const seriesGames = rows.length
			? await db.query.games.findMany({
					where: { seriesId: { in: rows.map((s) => s.id) } },
					columns: { seriesId: true, startsAt: true },
				})
			: []
		const firstGameAt = new Map<string, Date>()
		for (const game of seriesGames) {
			if (!game.seriesId) continue
			const known = firstGameAt.get(game.seriesId)
			if (!known || game.startsAt < known) {
				firstGameAt.set(game.seriesId, game.startsAt)
			}
		}
		const roundCodes = currentRounds(
			rows.map((s) => ({ ...s, firstGameAt: firstGameAt.get(s.id) ?? null })),
		)
		const firstAt = (s: PostseasonSeries) =>
			firstGameAt.get(s.id)?.getTime() ?? Number.POSITIVE_INFINITY
		const series = rows
			.filter((s) => roundCodes.includes(s.round))
			.sort(
				(a, b) =>
					roundCodes.indexOf(a.round) - roundCodes.indexOf(b.round) ||
					firstAt(a) - firstAt(b) ||
					a.id.localeCompare(b.id),
			)
		return { roundCodes, series }
	})
}

const LeaguePostseasonRef = builder
	.objectRef<LeaguePostseason>("LeaguePostseason")
	.implement({
		description:
			"A league's postseason while it's being played: the rounds on now and their series.",
		fields: (t) => ({
			// Display names of the rounds being played now, in the order each
			// first plays ("NL Wild Card Series", "AL Wild Card Series").
			roundLabels: t.stringList({
				resolve: async ({ season }, _args, ctx) =>
					(await loadCurrentRoundSeries(ctx, season.id)).roundCodes.map(
						roundLabel,
					),
			}),
			// Every series in those rounds, finished ones included.
			series: t.field({
				type: [PostseasonSeriesRef],
				resolve: async ({ season }, _args, ctx) =>
					(await loadCurrentRoundSeries(ctx, season.id)).series,
			}),
			// Elimination and winner-take-all games in the window the league is
			// inside now, not yet final - see isEliminationGame. 0 between
			// windows.
			currentWindowEliminationGameCount: t.int({
				resolve: async ({ league }, _args, ctx) => {
					const now = new Date()
					const windows = await getLeagueWindows(league)
					const current = windows.find(
						(w) => w.rangeStart <= now && now <= w.rangeEnd,
					)
					if (!current) return 0
					const rows = await db
						.select({ id: games.id, seriesId: games.seriesId })
						.from(games)
						.where(
							and(
								eq(games.leagueId, league.id),
								windowGameFilter(current),
								isNotNull(games.seriesId),
								ne(games.status, "final"),
							),
						)
					const bundles = await Promise.all(
						rows.map((row) =>
							row.seriesId ? seriesLoader(ctx).load(row.seriesId) : null,
						),
					)
					return rows.filter((row, i) => {
						const bundle = bundles[i]
						const game = bundle?.games.find((g) => g.id === row.id)
						return (
							bundle &&
							game &&
							isEliminationGame(game, bundle.games, bundle.series.bestOf)
						)
					}).length
				},
			}),
		}),
	})

// Null outside the current season's postseason (see seasonPhase), so a
// caller can branch on the field's presence alone.
builder.objectField(LeagueRef, "postseason", (t) =>
	t.field({
		type: LeaguePostseasonRef,
		nullable: true,
		resolve: async (league) => {
			const season = await getCurrentSeason(league.id)
			if (!season || seasonPhase(season) !== "postseason") return null
			return { league, season }
		},
	}),
)
