import { match } from "ts-pattern"
import { db } from "../../db"
import { boxStatSourceFor } from "../stat-context/stat-source"
import {
	type GameMaxRequest,
	type GameTotalRequest,
	gameMaxima,
	gameTotalSeries,
	type PlayerSeriesRequest,
	playerSeries,
	type SeriesGame,
	type TeamSeriesRequest,
	teamSeries,
} from "./queries"

// The one line of recent form a game page puts on a question's card: enough
// for someone with no feel for the question to have something to react to,
// without opening it. The numbers only - the page writes the sentence.
//
// Read from the same stored box-score columns the question settles from (see
// boxStatSourceFor), so a card's "over in 7 of 10" is counted off the same
// figure the result will be.

export type CardFactKind =
	// How often the subject went over this line.
	| "line_hits"
	// How often each team's games went over the combined line.
	| "total_hits"
	// Each side's average, for a head to head.
	| "averages"
	// How often the favorite led a game in the stat.
	| "leader_hits"

export type CardFactSide = {
	label: string
	games: number
	// Null where the kind counts nothing.
	hits: number | null
	mean: number
}

export type CardFact = {
	kind: CardFactKind
	statLabel: string
	line: number | null
	sides: CardFactSide[]
}

// Fewer games than this and "over in 2 of 2" says more about the sample than
// the subject.
export const MIN_FACT_GAMES = 3

type FactInput = Awaited<ReturnType<typeof loadInputs>>[number]

type SeriesRef = { from: "player" | "team" | "total"; reqId: string }

type Plan =
	| { kind: "line_hits"; series: SeriesRef; label: string }
	| { kind: "total_hits"; series: [SeriesRef, SeriesRef]; labels: string[] }
	| { kind: "averages"; series: [SeriesRef, SeriesRef]; labels: string[] }
	| {
			kind: "leader_hits"
			series: SeriesRef
			label: string
			statKeys: readonly string[]
	  }

function loadInputs(questionIds: string[]) {
	return db.query.questions.findMany({
		where: { id: { in: questionIds } },
		columns: {
			id: true,
			shape: true,
			ouLine: true,
			locksAt: true,
			seasonId: true,
			customStat: true,
			statAggregation: true,
			subjectPlayerId: true,
			subjectTeamId: true,
			leaderBasis: true,
		},
		with: {
			stat: { columns: { name: true } },
			league: { columns: { slug: true } },
			game: {
				columns: { id: true },
				with: {
					homeTeam: { columns: { id: true, abbreviation: true } },
					awayTeam: { columns: { id: true, abbreviation: true } },
				},
			},
			subjectPlayer: { columns: { name: true } },
			subjectTeam: { columns: { name: true } },
			options: {
				columns: {
					label: true,
					playerId: true,
					modelHitRate: true,
					sortOrder: true,
				},
			},
		},
	})
}

// The leader question's favorite as generated, or failing that (a pool
// refiltered since), the option priced likeliest to lead.
function favoriteOf(
	question: FactInput,
): { playerId: string; label: string } | null {
	const players = question.options.filter((o) => o.playerId)
	const stored = question.leaderBasis?.favoritePlayerId
	const chosen =
		players.find((o) => o.playerId === stored) ??
		[...players]
			.filter((o) => o.modelHitRate !== null)
			.sort((a, b) => (b.modelHitRate ?? 0) - (a.modelHitRate ?? 0))[0]
	return chosen?.playerId
		? { playerId: chosen.playerId, label: chosen.label }
		: null
}

type Requests = {
	player: PlayerSeriesRequest[]
	team: TeamSeriesRequest[]
	total: GameTotalRequest[]
}

function planFor(question: FactInput, requests: Requests): Plan | null {
	const game = question.game
	const league = question.league
	if (!game || !league) return null
	const { homeTeam, awayTeam } = game
	if (!homeTeam || !awayTeam) return null
	const source = boxStatSourceFor({
		shape: question.shape,
		leagueSlug: league.slug,
		statName: question.stat?.name ?? null,
		customStat: question.customStat,
		statAggregation: question.statAggregation,
	})
	const asOf = question.locksAt
	const playerRef = (playerId: string, slot: number): SeriesRef | null => {
		if (source?.subject !== "player") return null
		const reqId = `${question.id}:${slot}`
		requests.player.push({
			reqId,
			playerId,
			statKeys: source.statKeys,
			asOf,
		})
		return { from: "player", reqId }
	}

	return (
		match(question.shape)
			.returnType<Plan | null>()
			.with("player_stat_over_under", () => {
				const series = question.subjectPlayerId
					? playerRef(question.subjectPlayerId, 0)
					: null
				return series
					? {
							kind: "line_hits",
							series,
							label: question.subjectPlayer?.name ?? "",
						}
					: null
			})
			.with("team_stat_over_under", () => {
				if (source?.subject !== "team" || source.origin === "athlete") {
					return null
				}
				if (!question.subjectTeamId) return null
				const reqId = `${question.id}:0`
				requests.team.push({
					reqId,
					teamId: question.subjectTeamId,
					scope: source.origin,
					statKeys: source.statKeys,
					asOf,
				})
				return {
					kind: "line_hits",
					series: { from: "team", reqId },
					label: question.subjectTeam?.name ?? "",
				}
			})
			// Off the games table rather than a stat source, the way the game
			// total's own matchup card reads it.
			.with("game_total_over_under", () => {
				if (!question.seasonId) return null
				const seasonId = question.seasonId
				const sides = [awayTeam, homeTeam].map((team, slot) => {
					const reqId = `${question.id}:${slot}`
					requests.total.push({ reqId, teamId: team.id, seasonId, asOf })
					return { from: "total", reqId } as const
				})
				return {
					kind: "total_hits",
					series: [sides[0], sides[1]] as [SeriesRef, SeriesRef],
					labels: [awayTeam.abbreviation, homeTeam.abbreviation],
				}
			})
			.with("player_vs_player", () => {
				const [a, b] = [...question.options].sort(
					(x, y) => x.sortOrder - y.sortOrder,
				)
				if (!a?.playerId || !b?.playerId) return null
				const left = playerRef(a.playerId, 0)
				const right = playerRef(b.playerId, 1)
				return left && right
					? {
							kind: "averages",
							series: [left, right],
							labels: [a.label, b.label],
						}
					: null
			})
			.with("player_game_stat_leader", () => {
				const favorite = favoriteOf(question)
				const series = favorite ? playerRef(favorite.playerId, 0) : null
				return favorite && series && source
					? {
							kind: "leader_hits",
							series,
							label: favorite.label,
							statKeys: source.statKeys,
						}
					: null
			})
			.with(
				"team_vs_team",
				"team_stat_numeric_guess",
				"player_stat_numeric_guess",
				"yes_no_prop",
				"player_season_stat_over_under",
				"team_season_stat_over_under",
				"player_vs_player_season",
				"team_vs_team_season",
				"player_season_award",
				"team_season_award",
				"player_award_finalists",
				"team_season_stat_numeric_guess",
				"player_season_stat_leader",
				"player_team_season_stat_leader",
				() => null,
			)
			.exhaustive()
	)
}

const round = (value: number) => Math.round(value * 1000) / 1000

function sideOf(
	games: SeriesGame[] | undefined,
	label: string,
	hit: ((game: SeriesGame) => boolean) | null,
): CardFactSide | null {
	if (!games || games.length < MIN_FACT_GAMES) return null
	const total = games.reduce((sum, game) => sum + game.value, 0)
	return {
		label,
		games: games.length,
		hits: hit ? games.filter(hit).length : null,
		mean: round(total / games.length),
	}
}

// One card fact per question id, in key order: null for a shape with no fact,
// a stat with no stored column, or a side with too few games. A two-sided
// fact needs both sides, the same rule the full stat card follows - one
// side's form next to a blank reads as a comparison when it isn't one.
export async function loadCardFacts(
	questionIds: string[],
): Promise<(CardFact | null)[]> {
	const inputs = await loadInputs(questionIds)
	const requests: Requests = { player: [], team: [], total: [] }
	const plans = new Map<string, Plan>()
	for (const input of inputs) {
		const plan = planFor(input, requests)
		if (plan) plans.set(input.id, plan)
	}

	const [player, team, total] = await Promise.all([
		playerSeries(requests.player),
		teamSeries(requests.team),
		gameTotalSeries(requests.total),
	])
	const seriesOf = (ref: SeriesRef) =>
		match(ref.from)
			.with("player", () => player.get(ref.reqId))
			.with("team", () => team.get(ref.reqId))
			.with("total", () => total.get(ref.reqId))
			.exhaustive()

	const leaderRequests: GameMaxRequest[] = []
	for (const plan of plans.values()) {
		if (plan.kind !== "leader_hits") continue
		const games = seriesOf(plan.series)
		if (!games || games.length < MIN_FACT_GAMES) continue
		leaderRequests.push({
			reqId: plan.series.reqId,
			statKeys: plan.statKeys,
			gameIds: games.map((game) => game.gameId),
		})
	}
	const maxima = await gameMaxima(leaderRequests)

	const byId = new Map(inputs.map((input) => [input.id, input]))
	return questionIds.map((id) => {
		const plan = plans.get(id)
		const input = byId.get(id)
		if (!plan || !input) return null
		const statLabel = input.stat?.name ?? ""
		const line = input.ouLine

		return (
			match(plan)
				.returnType<CardFact | null>()
				.with({ kind: "line_hits" }, (p) => {
					if (line === null) return null
					const side = sideOf(
						seriesOf(p.series),
						p.label,
						(g) => g.value > line,
					)
					return side
						? { kind: "line_hits", statLabel, line, sides: [side] }
						: null
				})
				.with({ kind: "total_hits" }, (p) => {
					if (line === null) return null
					const sides = p.series.map((ref, i) =>
						sideOf(seriesOf(ref), p.labels[i] ?? "", (g) => g.value > line),
					)
					return sides.every((side): side is CardFactSide => side !== null)
						? { kind: "total_hits", statLabel, line, sides }
						: null
				})
				.with({ kind: "averages" }, (p) => {
					const sides = p.series.map((ref, i) =>
						sideOf(seriesOf(ref), p.labels[i] ?? "", null),
					)
					return sides.every((side): side is CardFactSide => side !== null)
						? { kind: "averages", statLabel, line: null, sides }
						: null
				})
				// A tie at the top counts as leading, as it does when a leader
				// question is graded. A game nobody recorded any of isn't led.
				.with({ kind: "leader_hits" }, (p) => {
					const maxByGame = maxima.get(p.series.reqId)
					const side = sideOf(
						seriesOf(p.series),
						p.label,
						(g) => g.value > 0 && g.value >= (maxByGame?.get(g.gameId) ?? 0),
					)
					return side
						? { kind: "leader_hits", statLabel, line: null, sides: [side] }
						: null
				})
				.exhaustive()
		)
	})
}
