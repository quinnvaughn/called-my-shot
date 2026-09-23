import { randomUUID } from "node:crypto"
import { beforeEach, describe, expect, it } from "vitest"
import { db } from "../../db"
import {
	playerGameStats,
	teamGameStats,
	type TeamSeasonStats,
	teamSeasonStats,
} from "../../db/schema"
import {
	HOUR,
	makeGame,
	makeLeague,
	makePlayer,
	makeSeason,
	makeTeam,
} from "../../test/factories"
import { buildStatContext, type SubjectRef } from "./build"
import {
	derivedDifferentialFrom,
	differentialFrom,
} from "./differential"
import { completedGames, type MatchupScope } from "./matchup"
import {
	homeAwaySplit,
	opponentAllowed,
	recentGames,
	restSplit,
	type StatContextScope,
	seasonToDate,
	shareOfTeamTotal,
} from "./queries"
import { recipeFor } from "./recipes"
import { boxStatSourceFor } from "./stat-source"

const NOW = new Date("2026-09-12T12:00:00Z")
const DAY = 24 * HOUR
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY)
const STAT_KEY = "points"

type World = Awaited<ReturnType<typeof seedWorld>>

async function seedWorld() {
	const league = await makeLeague({ slug: "nba" })
	const season = await makeSeason({ leagueId: league.id })
	const team = await makeTeam({ leagueId: league.id })
	const opponent = await makeTeam({ leagueId: league.id })
	const player = await makePlayer({
		currentTeamId: team.id,
		positions: ["SG"],
	})
	return { league, season, team, opponent, player }
}

// One appearance. Defaults put the subject at home against the same opponent
// so a test only has to state what it's actually varying.
async function appearance(
	world: World,
	options: {
		daysAgo: number
		value: number | null
		playerId?: string | null
		teamId?: string
		opponentTeamId?: string
		isHome?: boolean
		didNotPlay?: boolean
		statKey?: string
	},
) {
	const teamId = options.teamId ?? world.team.id
	const opponentTeamId = options.opponentTeamId ?? world.opponent.id
	const game = await makeGame({
		leagueId: world.league.id,
		seasonId: world.season.id,
		homeTeamId: options.isHome === false ? opponentTeamId : teamId,
		awayTeamId: options.isHome === false ? teamId : opponentTeamId,
		startsAt: daysAgo(options.daysAgo),
		status: "final",
	})
	await db.insert(playerGameStats).values({
		gameId: game.id,
		source: "espn",
		sourceAthleteId: `nba:${options.playerId ?? world.player.id}`,
		playerId:
			options.playerId === null ? null : (options.playerId ?? world.player.id),
		teamId,
		opponentTeamId,
		isHome: options.isHome ?? true,
		gameDate: daysAgo(options.daysAgo),
		seasonId: world.season.id,
		leagueId: world.league.id,
		statKey: options.statKey ?? STAT_KEY,
		valueText: String(options.value ?? "--"),
		valueNumeric: options.value,
		didNotPlay: options.didNotPlay ?? false,
	})
	return game
}

function scopeFor(world: World, overrides: Partial<StatContextScope> = {}) {
	return {
		subjectKind: "player",
		playerId: world.player.id,
		teamId: world.team.id,
		teamScope: null,
		opponentTeamId: world.opponent.id,
		seasonId: world.season.id,
		statKeys: [STAT_KEY],
		asOf: NOW,
		ouLine: null,
		positions: [],
		...overrides,
	} satisfies StatContextScope
}

let world: World
beforeEach(async () => {
	world = await seedWorld()
})

describe("recentGames", () => {
	it("returns the most recent appearances first", async () => {
		await appearance(world, { daysAgo: 9, value: 10 })
		await appearance(world, { daysAgo: 2, value: 30 })
		await appearance(world, { daysAgo: 5, value: 20 })

		const games = await recentGames(scopeFor(world), 10)

		expect(games.map((g) => g.value)).toEqual([30, 20, 10])
	})

	it("stops at the question's lock time", async () => {
		await appearance(world, { daysAgo: 5, value: 20 })
		// The game being asked about. Including it would make a resolved
		// question's page show the answer as if it were context.
		await appearance(world, { daysAgo: 0, value: 99 })

		const games = await recentGames(scopeFor(world, { asOf: daysAgo(1) }), 10)

		expect(games.map((g) => g.value)).toEqual([20])
	})

	it("shows a night off rather than hiding it", async () => {
		await appearance(world, { daysAgo: 4, value: 20 })
		await appearance(world, { daysAgo: 2, value: null, didNotPlay: true })

		const games = await recentGames(scopeFor(world), 10)

		expect(games[0]).toMatchObject({ value: null, didNotPlay: true })
		expect(games).toHaveLength(2)
	})

	it("honours the window size", async () => {
		for (const day of [2, 3, 4, 5]) {
			await appearance(world, { daysAgo: day, value: day })
		}

		expect(await recentGames(scopeFor(world), 2)).toHaveLength(2)
	})
})

describe("seasonToDate", () => {
	it("averages appearances and leaves nights off out", async () => {
		await appearance(world, { daysAgo: 6, value: 10 })
		await appearance(world, { daysAgo: 4, value: 30 })
		await appearance(world, { daysAgo: 2, value: null, didNotPlay: true })

		const split = await seasonToDate(scopeFor(world))

		// A night off counted as a zero would read 13.3 instead of 20.
		expect(split).toMatchObject({ games: 2, total: 40, mean: 20 })
	})

	it("counts how often the line was cleared when there is one", async () => {
		await appearance(world, { daysAgo: 6, value: 10 })
		await appearance(world, { daysAgo: 5, value: 30 })
		await appearance(world, { daysAgo: 4, value: 40 })

		const split = await seasonToDate(scopeFor(world, { ouLine: 25 }))

		expect(split?.overLine).toBe(2)
	})

	it("is null for a subject with no stored history", async () => {
		expect(await seasonToDate(scopeFor(world))).toBeNull()
	})
})

describe("a stat made of several keys", () => {
	const KEYS = ["rushing.rushingYards", "receiving.receivingYards"]

	it("adds the keys up per game, one appearance each", async () => {
		const both = await appearance(world, {
			daysAgo: 6,
			value: 60,
			statKey: KEYS[0],
		})
		await db.insert(playerGameStats).values({
			gameId: both.id,
			source: "espn",
			sourceAthleteId: `nba:${world.player.id}`,
			playerId: world.player.id,
			teamId: world.team.id,
			opponentTeamId: world.opponent.id,
			isHome: true,
			gameDate: daysAgo(6),
			seasonId: world.season.id,
			leagueId: world.league.id,
			statKey: KEYS[1],
			valueText: "25",
			valueNumeric: 25,
			didNotPlay: false,
		})
		// Carries and no catches: no receiving row at all.
		await appearance(world, { daysAgo: 3, value: 40, statKey: KEYS[0] })

		const scope = scopeFor(world, { statKeys: KEYS, ouLine: 50.5 })

		expect((await recentGames(scope, 10)).map((g) => g.value)).toEqual([40, 85])
		expect(await seasonToDate(scope)).toMatchObject({
			games: 2,
			total: 125,
			overLine: 1,
		})
	})
})

describe("homeAwaySplit", () => {
	it("separates the two sides", async () => {
		await appearance(world, { daysAgo: 6, value: 30, isHome: true })
		await appearance(world, { daysAgo: 4, value: 20, isHome: true })
		await appearance(world, { daysAgo: 2, value: 10, isHome: false })

		const { home, away } = await homeAwaySplit(scopeFor(world))

		expect(home).toMatchObject({ games: 2, mean: 25 })
		expect(away).toMatchObject({ games: 1, mean: 10 })
	})

	it("leaves a side null when it hasn't happened yet", async () => {
		await appearance(world, { daysAgo: 3, value: 30, isHome: true })

		const { home, away } = await homeAwaySplit(scopeFor(world))

		expect(home).not.toBeNull()
		expect(away).toBeNull()
	})
})

describe("restSplit", () => {
	it("splits on the subject's own median rest", async () => {
		// Gaps of 1, 3 and 3 days. Median 3, so the one-day gap is short rest.
		await appearance(world, { daysAgo: 10, value: 10 })
		await appearance(world, { daysAgo: 9, value: 12 })
		await appearance(world, { daysAgo: 6, value: 30 })
		await appearance(world, { daysAgo: 3, value: 30 })

		const rest = await restSplit(scopeFor(world))

		expect(rest?.medianRestDays).toBe(3)
		expect(rest?.shortRest).toMatchObject({ games: 1, mean: 12 })
		expect(rest?.longRest).toMatchObject({ games: 2, mean: 30 })
	})

	// A weekly league has no rest variation to speak of, so claiming a split
	// would be inventing one.
	it("is null when every gap is the same", async () => {
		await appearance(world, { daysAgo: 21, value: 10 })
		await appearance(world, { daysAgo: 14, value: 20 })
		await appearance(world, { daysAgo: 7, value: 30 })

		expect(await restSplit(scopeFor(world))).toBeNull()
	})

	it("is null without two appearances to measure a gap between", async () => {
		await appearance(world, { daysAgo: 3, value: 10 })

		expect(await restSplit(scopeFor(world))).toBeNull()
	})
})

describe("opponentAllowed", () => {
	it("averages per game, not per player", async () => {
		const other = await makePlayer({ currentTeamId: world.team.id })
		// One game, two players, 30 between them.
		const game = await appearance(world, { daysAgo: 5, value: 20 })
		await db.insert(playerGameStats).values({
			gameId: game.id,
			source: "espn",
			sourceAthleteId: `nba:${other.id}`,
			playerId: other.id,
			teamId: world.team.id,
			opponentTeamId: world.opponent.id,
			isHome: true,
			gameDate: daysAgo(5),
			seasonId: world.season.id,
			leagueId: world.league.id,
			statKey: STAT_KEY,
			valueText: "10",
			valueNumeric: 10,
			didNotPlay: false,
		})

		const allowed = await opponentAllowed(scopeFor(world))

		expect(allowed).toMatchObject({ games: 1, meanAllowed: 30 })
	})

	it("narrows to the subject's position when one is known", async () => {
		const guard = await makePlayer({
			currentTeamId: world.team.id,
			positions: ["SG"],
		})
		const center = await makePlayer({
			currentTeamId: world.team.id,
			positions: ["C"],
		})
		// Both in the same game, so the per-game total is 60 and the filtered
		// one is the guard's 20.
		const game = await appearance(world, {
			daysAgo: 5,
			value: 20,
			playerId: guard.id,
		})
		await db.insert(playerGameStats).values({
			gameId: game.id,
			source: "espn",
			sourceAthleteId: `nba:${center.id}`,
			playerId: center.id,
			teamId: world.team.id,
			opponentTeamId: world.opponent.id,
			isHome: true,
			gameDate: daysAgo(5),
			seasonId: world.season.id,
			leagueId: world.league.id,
			statKey: STAT_KEY,
			valueText: "40",
			valueNumeric: 40,
			didNotPlay: false,
		})

		const all = await opponentAllowed(scopeFor(world))
		const guards = await opponentAllowed(scopeFor(world, { positions: ["SG"] }))

		expect(all?.meanAllowed).toBe(60)
		expect(guards?.meanAllowed).toBe(20)
		expect(guards?.positions).toEqual(["SG"])
	})

	// An unlinked athlete has no position on file, so claiming they belong in a
	// position bucket would be a guess. They still count toward the total.
	it("keeps an unlinked athlete in the total and out of the filter", async () => {
		await appearance(world, { daysAgo: 5, value: 25, playerId: null })

		const all = await opponentAllowed(scopeFor(world))
		const guards = await opponentAllowed(scopeFor(world, { positions: ["SG"] }))

		expect(all?.meanAllowed).toBe(25)
		expect(guards).toBeNull()
	})
})

describe("shareOfTeamTotal", () => {
	it("divides by the stored team total, not the sum of the player rows", async () => {
		const game = await appearance(world, { daysAgo: 5, value: 25 })
		// ESPN's printed total is deliberately higher than the players sum, the
		// way a team-credited rebound makes it. Summing player rows would say
		// 100%; the real share is a quarter.
		await db.insert(teamGameStats).values({
			gameId: game.id,
			source: "espn",
			scope: "player_table_total",
			teamId: world.team.id,
			opponentTeamId: world.opponent.id,
			isHome: true,
			gameDate: daysAgo(5),
			seasonId: world.season.id,
			leagueId: world.league.id,
			statKey: STAT_KEY,
			valueText: "100",
			valueNumeric: 100,
		})

		const share = await shareOfTeamTotal(scopeFor(world))

		expect(share).toMatchObject({ playerTotal: 25, teamTotal: 100 })
		expect(share?.sharePct).toBeCloseTo(25)
	})

	it("is null when the player tables carry no total for the stat", async () => {
		await appearance(world, { daysAgo: 5, value: 25 })

		expect(await shareOfTeamTotal(scopeFor(world))).toBeNull()
	})
})

// Team questions read team_game_stats rather than player_game_stats, which is
// what makes "team runs" and "total points in this game" answerable at all.
describe("team subjects", () => {
	async function teamGame(
		days: number,
		value: number,
		options: { isHome?: boolean; scope?: "team_box" | "final_score" } = {},
	) {
		const isHome = options.isHome ?? true
		const game = await makeGame({
			leagueId: world.league.id,
			seasonId: world.season.id,
			homeTeamId: isHome ? world.team.id : world.opponent.id,
			awayTeamId: isHome ? world.opponent.id : world.team.id,
			startsAt: daysAgo(days),
			status: "final",
		})
		await db.insert(teamGameStats).values({
			gameId: game.id,
			source: "espn",
			scope: options.scope ?? "team_box",
			teamId: world.team.id,
			opponentTeamId: world.opponent.id,
			isHome,
			gameDate: daysAgo(days),
			seasonId: world.season.id,
			leagueId: world.league.id,
			statKey: STAT_KEY,
			valueText: String(value),
			valueNumeric: value,
		})
		return game
	}

	const teamScope = (overrides: Partial<StatContextScope> = {}) =>
		({
			...scopeFor(world),
			subjectKind: "team",
			playerId: null,
			teamScope: "team_box",
			...overrides,
		}) satisfies StatContextScope

	it("reads a team's own game log", async () => {
		await teamGame(5, 4)
		await teamGame(2, 7)

		const games = await recentGames(teamScope(), 10)

		expect(games.map((g) => g.value)).toEqual([7, 4])
		// A team always plays its own game.
		expect(games.every((g) => !g.didNotPlay)).toBe(true)
	})

	it("averages and splits a team's season", async () => {
		await teamGame(6, 4, { isHome: true })
		await teamGame(4, 8, { isHome: true })
		await teamGame(2, 3, { isHome: false })

		const season = await seasonToDate(teamScope())
		const { home, away } = await homeAwaySplit(teamScope())

		expect(season).toMatchObject({ games: 3, total: 15, mean: 5 })
		expect(home).toMatchObject({ games: 2, mean: 6 })
		expect(away).toMatchObject({ games: 1, mean: 3 })
	})

	// The final score is stored as an ordinary team stat, which is what lets a
	// points question work without a special path through any of this.
	it("reads the final score like any other team stat", async () => {
		await teamGame(3, 27, { scope: "final_score" })

		const season = await seasonToDate(teamScope({ teamScope: "final_score" }))

		expect(season).toMatchObject({ games: 1, mean: 27 })
	})

	it("keeps the two team scopes apart", async () => {
		await teamGame(3, 4, { scope: "team_box" })
		await teamGame(3, 27, { scope: "final_score" })

		expect((await seasonToDate(teamScope()))?.mean).toBe(4)
		expect(
			(await seasonToDate(teamScope({ teamScope: "final_score" })))?.mean,
		).toBe(27)
	})

	// What the other side gives up, which for a team scoring question is the
	// half of the matchup the team's own log can't show.
	it("reads what the opponent has allowed on the final score", async () => {
		await teamGame(6, 31, { scope: "final_score" })
		await teamGame(3, 17, { scope: "final_score" })

		const allowed = await opponentAllowed(
			teamScope({ teamScope: "final_score" }),
		)

		expect(allowed).toMatchObject({
			teamId: world.opponent.id,
			games: 2,
			meanAllowed: 24,
		})
		// A team has no positions to filter to, so the card can't claim one.
		expect(allowed?.positions).toEqual([])
	})

	it("has no share of its own total", async () => {
		await teamGame(3, 4)

		expect(await shareOfTeamTotal(teamScope())).toBeNull()
	})
})

describe("boxStatSourceFor", () => {
	const base = {
		leagueSlug: "nba",
		customStat: null,
		statAggregation: null,
	} as const

	it("resolves a catalog stat to its raw ESPN column", () => {
		expect(
			boxStatSourceFor({
				...base,
				shape: "player_stat_over_under",
				statName: "Points",
			}),
		).toMatchObject({
			statKeys: ["points"],
			subject: "player",
			origin: "athlete",
		})
	})

	it("resolves an MLB counting stat to its table-prefixed column", () => {
		expect(
			boxStatSourceFor({
				...base,
				leagueSlug: "mlb",
				shape: "player_stat_over_under",
				statName: "Hits",
			}),
		).toMatchObject({ statKeys: ["batting.hits"] })
	})

	// The trap the whole mechanism exists for: ESPN's box score reports this
	// column season-to-date, so a game log built from it would be nonsense.
	it("refuses an MLB rate whose box-score column is season-to-date", () => {
		expect(
			boxStatSourceFor({
				...base,
				leagueSlug: "mlb",
				shape: "player_stat_over_under",
				statName: "Batting Average",
			}),
		).toBeNull()
	})

	it("refuses a custom stat and a season-scoped question", () => {
		expect(
			boxStatSourceFor({
				...base,
				shape: "player_stat_over_under",
				statName: null,
				customStat: "vibes",
			}),
		).toBeNull()
		expect(
			boxStatSourceFor({
				...base,
				shape: "player_season_stat_over_under",
				statName: "Points",
			}),
		).toBeNull()
	})
})

describe("buildStatContext", () => {
	const questionBase = {
		leagueSlug: "nba",
		statName: "Points",
		customStat: null,
		statAggregation: null,
		ouLine: 22.5,
		locksAt: NOW,
	} as const

	// The game being asked about. Only its two teams matter to a stat log; the
	// id and start are there for the matchup branch, which measures rest into
	// kickoff and leaves this game out of both records by id.
	const gameRef = () => ({
		id: randomUUID(),
		homeTeamId: world.team.id,
		awayTeamId: world.opponent.id,
		startsAt: NOW,
	})

	const refFor = (
		player: { id: string },
		label: string,
		teamInGameId: string,
	): SubjectRef => ({
		label,
		playerId: player.id,
		teamId: null,
		positions: ["SG"],
		teamInGameId,
	})

	it("builds one side for a single-subject question", async () => {
		await appearance(world, { daysAgo: 5, value: 30 })

		const context = await buildStatContext({
			...questionBase,
			shape: "player_stat_over_under",
			seasonId: world.season.id,
			game: gameRef(),
			subject: refFor(world.player, "Subject", world.team.id),
			competitors: [],
			optionSubjects: [],
		})

		expect(context?.subjects).toHaveLength(1)
		expect(context?.subjects[0]?.recentGames).toHaveLength(1)
		expect(context?.matchup).toBeNull()
	})

	// End to end for the card a team over/under actually shows: its own log
	// plus what the side it is facing has been giving up.
	it("gives a team over/under the opposing defense", async () => {
		const scoreRow = async (
			teamId: string,
			opponentTeamId: string,
			days: number,
			score: number,
		) => {
			const game = await makeGame({
				leagueId: world.league.id,
				seasonId: world.season.id,
				homeTeamId: teamId,
				awayTeamId: opponentTeamId,
				startsAt: daysAgo(days),
				status: "final",
			})
			await db.insert(teamGameStats).values({
				gameId: game.id,
				source: "espn",
				scope: "final_score",
				teamId,
				opponentTeamId,
				isHome: true,
				gameDate: daysAgo(days),
				seasonId: world.season.id,
				leagueId: world.league.id,
				statKey: "score",
				valueText: String(score),
				valueNumeric: score,
			})
		}

		// The subject's own two games, both against the side it now faces.
		await scoreRow(world.team.id, world.opponent.id, 8, 24)
		await scoreRow(world.team.id, world.opponent.id, 6, 20)
		// A third team the opponent also played, so what the opponent allows
		// is its own number rather than a copy of the subject's.
		const other = await makeTeam({ leagueId: world.league.id })
		await scoreRow(other.id, world.opponent.id, 4, 40)

		const context = await buildStatContext({
			...questionBase,
			shape: "team_stat_over_under",
			seasonId: world.season.id,
			game: gameRef(),
			subject: {
				label: "Subject",
				playerId: null,
				teamId: world.team.id,
				positions: [],
				teamInGameId: world.team.id,
			},
			competitors: [],
			optionSubjects: [],
		})

		const side = context?.subjects[0]
		expect(side?.seasonToDate?.mean).toBe(22)
		expect(side?.opponentAllowed).toMatchObject({
			teamId: world.opponent.id,
			games: 3,
			meanAllowed: 28,
		})
	})

	it("builds both sides of a head-to-head, in option order", async () => {
		const rival = await makePlayer({
			currentTeamId: world.opponent.id,
			positions: ["SG"],
		})
		await appearance(world, { daysAgo: 5, value: 30 })
		await appearance(world, {
			daysAgo: 4,
			value: 12,
			playerId: rival.id,
			teamId: world.opponent.id,
			opponentTeamId: world.team.id,
		})

		const context = await buildStatContext({
			...questionBase,
			shape: "player_vs_player",
			ouLine: null,
			seasonId: world.season.id,
			game: gameRef(),
			subject: null,
			competitors: [],
			optionSubjects: [
				refFor(world.player, "Subject", world.team.id),
				refFor(rival, "Rival", world.opponent.id),
			],
		})

		expect(context?.subjects.map((s) => s.label)).toEqual(["Subject", "Rival"])
		expect(context?.subjects[0]?.seasonToDate?.mean).toBe(30)
		expect(context?.subjects[1]?.seasonToDate?.mean).toBe(12)
	})

	// One filled column beside a blank one reads as a comparison when it isn't.
	it("drops the whole head-to-head when one side has no history", async () => {
		const rival = await makePlayer({ currentTeamId: world.opponent.id })
		await appearance(world, { daysAgo: 5, value: 30 })

		const context = await buildStatContext({
			...questionBase,
			shape: "player_vs_player",
			ouLine: null,
			seasonId: world.season.id,
			game: gameRef(),
			subject: null,
			competitors: [],
			optionSubjects: [
				refFor(world.player, "Subject", world.team.id),
				refFor(rival, "Rival", world.opponent.id),
			],
		})

		expect(context).toBeNull()
	})

	// A pool question's answer is who is in front, so it gets a ranking rather
	// than a card each - ten game logs was never the useful view.
	it("ranks the pool for a leader question, best first", async () => {
		const rival = await makePlayer({ currentTeamId: world.team.id })
		const bench = await makePlayer({ currentTeamId: world.team.id })
		await appearance(world, { daysAgo: 5, value: 10 })
		await appearance(world, { daysAgo: 5, value: 30, playerId: rival.id })

		const context = await buildStatContext({
			...questionBase,
			shape: "player_game_stat_leader",
			seasonId: world.season.id,
			game: gameRef(),
			subject: null,
			competitors: [],
			optionSubjects: [
				refFor(world.player, "Subject", world.team.id),
				refFor(rival, "Rival", world.team.id),
				// No stored appearance at all, so no number to rank on.
				refFor(bench, "Bench", world.team.id),
			],
		})

		expect(context?.subjects).toEqual([])
		// A stat-backed shape must never grow a matchup.
		expect(context?.matchup).toBeNull()
		expect(context?.ranking.map((r) => r.mean)).toEqual([30, 10])
		// A zero would rank an unknown player as genuinely bad.
		expect(context?.ranking).toHaveLength(2)
	})

	it("returns nothing when no one in the pool has played", async () => {
		const context = await buildStatContext({
			...questionBase,
			shape: "player_game_stat_leader",
			seasonId: world.season.id,
			game: gameRef(),
			subject: null,
			competitors: [],
			optionSubjects: [refFor(world.player, "Subject", world.team.id)],
		})

		expect(context).toBeNull()
	})
})

// A finished game with a scoreboard on it. The matchup layer reads `games`
// directly, so nothing here touches the box-score tables.
async function finished(
	world: World,
	options: {
		daysAgo: number
		homeTeamId?: string
		awayTeamId?: string
		homeScore: number
		awayScore: number
		seasonType?: "regular" | "postseason"
		status?: "scheduled" | "live" | "final"
	},
) {
	return makeGame({
		leagueId: world.league.id,
		seasonId: world.season.id,
		homeTeamId: options.homeTeamId ?? world.team.id,
		awayTeamId: options.awayTeamId ?? world.opponent.id,
		startsAt: daysAgo(options.daysAgo),
		status: options.status ?? "final",
		seasonType: options.seasonType ?? "regular",
		homeScore: options.homeScore,
		awayScore: options.awayScore,
	})
}

describe("completedGames", () => {
	const scopeFor = (world: World, overrides: Partial<MatchupScope> = {}) =>
		({
			seasonId: world.season.id,
			teamIds: [world.team.id, world.opponent.id],
			asOf: NOW,
			excludeGameId: randomUUID(),
			...overrides,
		}) satisfies MatchupScope

	it("returns a game once per side, from each side's own point of view", async () => {
		await finished(world, { daysAgo: 5, homeScore: 24, awayScore: 17 })

		const rows = await completedGames(scopeFor(world))

		expect(rows).toHaveLength(2)
		const home = rows.find((row) => row.teamId === world.team.id)
		const away = rows.find((row) => row.teamId === world.opponent.id)
		expect(home).toMatchObject({ isHome: true, pointsFor: 24, pointsAgainst: 17 })
		expect(away).toMatchObject({ isHome: false, pointsFor: 17, pointsAgainst: 24 })
	})

	it("names the opponent on every row", async () => {
		await finished(world, { daysAgo: 5, homeScore: 24, awayScore: 17 })

		const rows = await completedGames(scopeFor(world))

		expect(rows.find((row) => row.teamId === world.team.id)).toMatchObject({
			opponentAbbreviation: world.opponent.abbreviation,
		})
	})

	it("stops at the question's lock time", async () => {
		await finished(world, { daysAgo: -1, homeScore: 24, awayScore: 17 })

		expect(await completedGames(scopeFor(world))).toEqual([])
	})

	// The lock time alone doesn't cover it: a game whose start was corrected
	// backwards, or a question that locked after kickoff, would otherwise fold
	// its own answer back in as context.
	it("leaves out the game being asked about even when it started first", async () => {
		const subject = await finished(world, {
			daysAgo: 5,
			homeScore: 24,
			awayScore: 17,
		})

		const rows = await completedGames(
			scopeFor(world, { excludeGameId: subject.id }),
		)

		expect(rows).toEqual([])
	})

	it("ignores a game that hasn't finished", async () => {
		await finished(world, {
			daysAgo: 5,
			homeScore: 24,
			awayScore: 17,
			status: "live",
		})

		expect(await completedGames(scopeFor(world))).toEqual([])
	})

	// team_records is ESPN's regular-season record and the matchup header
	// prints it directly above this card. Folding January in would put a 13-4
	// under a header saying 11-6.
	it("keeps postseason games out of a season record", async () => {
		await finished(world, {
			daysAgo: 5,
			homeScore: 24,
			awayScore: 17,
			seasonType: "postseason",
		})

		expect(await completedGames(scopeFor(world))).toEqual([])
	})
})

describe("buildStatContext for a game-level question", () => {
	const questionBase = {
		leagueSlug: "nba",
		statName: null,
		customStat: null,
		statAggregation: null,
		ouLine: null,
		locksAt: NOW,
		subject: null,
	} as const

	const teamRef = (team: { id: string; name: string }): SubjectRef => ({
		label: team.name,
		playerId: null,
		teamId: team.id,
		positions: [],
		teamInGameId: team.id,
	})

	// The game being asked about: our team at home, kicking off at NOW.
	const askAbout = async (
		overrides: Partial<Parameters<typeof buildStatContext>[0]> = {},
	) => {
		const game = await makeGame({
			leagueId: world.league.id,
			seasonId: world.season.id,
			homeTeamId: world.team.id,
			awayTeamId: world.opponent.id,
			startsAt: NOW,
		})
		return buildStatContext({
			...questionBase,
			shape: "team_vs_team",
			seasonId: world.season.id,
			game: {
				id: game.id,
				homeTeamId: game.homeTeamId,
				awayTeamId: game.awayTeamId,
				startsAt: game.startsAt,
			},
			competitors: [teamRef(world.team), teamRef(world.opponent)],
			optionSubjects: [] as SubjectRef[],
			...overrides,
		})
	}

	// Both sides need history or the matchup drops, so this is the fixture
	// almost every test below starts from.
	const bothPlayed = async () => {
		// Against a third team on both sides, so neither game doubles as a
		// meeting between the two this question is about.
		const other = await makeTeam({ leagueId: world.league.id })
		await finished(world, {
			daysAgo: 7,
			awayTeamId: other.id,
			homeScore: 30,
			awayScore: 20,
		})
		await finished(world, {
			daysAgo: 3,
			homeTeamId: other.id,
			awayTeamId: world.opponent.id,
			homeScore: 10,
			awayScore: 14,
		})
		return other
	}

	// The whole point of the branch: this shape carries no stat, so
	// boxStatSourceFor is null for it and the old code path returned nothing.
	it("builds a matchup for a question with no stat at all", async () => {
		await bothPlayed()

		const context = await askAbout()

		expect(context?.matchup).not.toBeNull()
		expect(context?.subjects).toEqual([])
		expect(context?.ranking).toEqual([])
		expect(context?.statLabel).toBe("")
	})

	it("orders the two columns the way the question lists its options", async () => {
		await bothPlayed()

		const context = await askAbout({
			optionSubjects: [teamRef(world.opponent), teamRef(world.team)],
		})

		expect(context?.matchup?.sides.map((side) => side.label)).toEqual([
			world.opponent.name,
			world.team.name,
		])
	})

	it("counts points from each team's own side of the scoreboard", async () => {
		await bothPlayed()

		const context = await askAbout()
		const [ours, theirs] = context?.matchup?.sides ?? []

		expect(ours?.overall).toMatchObject({
			games: 1,
			wins: 1,
			losses: 0,
			pointsForPerGame: 30,
			pointsAgainstPerGame: 20,
		})
		expect(theirs?.overall).toMatchObject({
			games: 1,
			wins: 1,
			losses: 0,
			pointsForPerGame: 14,
			pointsAgainstPerGame: 10,
		})
	})

	it("reads the home team's home games and the visitor's road games", async () => {
		const other = await makeTeam({ leagueId: world.league.id })
		// Ours: one at home, one away. Theirs: one away only. All against a
		// third team, so a road game of ours isn't also a home game of theirs.
		await finished(world, {
			daysAgo: 9,
			awayTeamId: other.id,
			homeScore: 30,
			awayScore: 20,
		})
		await finished(world, {
			daysAgo: 6,
			homeTeamId: other.id,
			awayTeamId: world.team.id,
			homeScore: 40,
			awayScore: 10,
		})
		await finished(world, {
			daysAgo: 3,
			homeTeamId: other.id,
			awayTeamId: world.opponent.id,
			homeScore: 10,
			awayScore: 14,
		})

		const context = await askAbout()
		const [ours, theirs] = context?.matchup?.sides ?? []

		// The home side's role record is its home games alone.
		expect(ours?.inThisRole).toMatchObject({ games: 1, wins: 1, losses: 0 })
		// The visitor's is its road games alone.
		expect(theirs?.inThisRole).toMatchObject({ games: 1, wins: 1, losses: 0 })
	})

	it("counts a tie as neither a win nor a loss", async () => {
		const other = await makeTeam({ leagueId: world.league.id })
		await finished(world, { daysAgo: 7, homeScore: 17, awayScore: 17 })
		await finished(world, {
			daysAgo: 3,
			homeTeamId: other.id,
			awayTeamId: world.opponent.id,
			homeScore: 10,
			awayScore: 14,
		})

		const context = await askAbout()
		const [ours] = context?.matchup?.sides ?? []

		expect(ours?.overall).toMatchObject({ games: 1, wins: 0, losses: 0, ties: 1 })
		expect(ours?.streak).toEqual({ outcome: "tie", length: 1 })
	})

	it("reports the current streak and how long it has run", async () => {
		const other = await makeTeam({ leagueId: world.league.id })
		await finished(world, { daysAgo: 12, homeScore: 10, awayScore: 20 })
		await finished(world, { daysAgo: 8, homeScore: 30, awayScore: 20 })
		await finished(world, { daysAgo: 4, homeScore: 31, awayScore: 20 })
		await finished(world, {
			daysAgo: 3,
			homeTeamId: other.id,
			awayTeamId: world.opponent.id,
			homeScore: 10,
			awayScore: 14,
		})

		const context = await askAbout()
		const [ours] = context?.matchup?.sides ?? []

		// Two wins since the loss, not three games.
		expect(ours?.streak).toEqual({ outcome: "win", length: 2 })
	})

	it("measures each side's rest from its last game to this kickoff", async () => {
		await bothPlayed()

		const context = await askAbout()
		const [ours, theirs] = context?.matchup?.sides ?? []

		expect(ours?.restDays).toBe(7)
		expect(theirs?.restDays).toBe(3)
	})

	it("lists prior meetings between these two teams, most recent first", async () => {
		await finished(world, { daysAgo: 20, homeScore: 30, awayScore: 20 })
		await finished(world, {
			daysAgo: 5,
			homeTeamId: world.opponent.id,
			awayTeamId: world.team.id,
			homeScore: 12,
			awayScore: 9,
		})

		const context = await askAbout()
		const meetings = context?.matchup?.meetings ?? []

		expect(meetings).toHaveLength(2)
		// Written from the home side of THAT game, not of this one.
		expect(meetings[0]).toMatchObject({
			homeTeamId: world.opponent.id,
			homeScore: 12,
			awayScore: 9,
			winnerTeamId: world.opponent.id,
		})
		expect(meetings[1]).toMatchObject({
			homeTeamId: world.team.id,
			winnerTeamId: world.team.id,
		})
	})

	it("leaves a meeting's winner null on a tie", async () => {
		await finished(world, { daysAgo: 5, homeScore: 17, awayScore: 17 })

		const context = await askAbout()

		expect(context?.matchup?.meetings[0]?.winnerTeamId).toBeNull()
	})

	// One filled column beside a blank one reads as a comparison when it isn't.
	it("drops the whole matchup when one side has never finished a game", async () => {
		const other = await makeTeam({ leagueId: world.league.id })
		await finished(world, {
			daysAgo: 7,
			homeTeamId: world.team.id,
			awayTeamId: other.id,
			homeScore: 30,
			awayScore: 20,
		})

		expect(await askAbout()).toBeNull()
	})

	it("returns nothing when neither side has played", async () => {
		expect(await askAbout()).toBeNull()
	})


	// A standings reading, dated. The card must read the last one taken BEFORE
	// the question locked - standings move, and today's row for a resolved
	// question contains the game it was asking about.
	const standingsRow = async (options: {
		teamId: string
		daysAgo: number
		pointsFor?: number
		pointsAgainst?: number
		possessions?: number | null
		homeWins?: number
		homeLosses?: number
		roadWins?: number
		roadLosses?: number
		streak?: string | null
	}) => {
		await db.insert(teamSeasonStats).values({
			teamId: options.teamId,
			seasonId: world.season.id,
			asOf: daysAgo(options.daysAgo),
			gamesPlayed: 20,
			pointsFor: options.pointsFor ?? 2200,
			pointsAgainst: options.pointsAgainst ?? 2100,
			pointDifferential: (options.pointsFor ?? 2200) - (options.pointsAgainst ?? 2100),
			homeWins: options.homeWins ?? 7,
			homeLosses: options.homeLosses ?? 3,
			homeTies: 0,
			roadWins: options.roadWins ?? 5,
			roadLosses: options.roadLosses ?? 5,
			roadTies: 0,
			streak: options.streak === undefined ? "W4" : options.streak,
			lastTen: "6-4",
			possessions: options.possessions === undefined ? 2000 : options.possessions,
		})
	}

	it("reads the last standings taken before the question locked", async () => {
		await bothPlayed()
		// Before the lock, and a later one that must not be used.
		await standingsRow({ teamId: world.team.id, daysAgo: 2, pointsFor: 2200, pointsAgainst: 2100 })
		await standingsRow({ teamId: world.team.id, daysAgo: -1, pointsFor: 9999, pointsAgainst: 0 })
		await standingsRow({ teamId: world.opponent.id, daysAgo: 2 })

		const context = await askAbout()
		const [ours] = context?.matchup?.sides ?? []

		// 100 over 2000 possessions = +5 per 100, not the post-lock row.
		expect(ours?.differential).toMatchObject({ kind: "net_rating" })
		expect(ours?.differential?.value).toBeCloseTo(5, 5)
	})

	it("has no differential when every standings reading postdates the lock", async () => {
		await bothPlayed()
		await standingsRow({ teamId: world.team.id, daysAgo: -1 })
		await standingsRow({ teamId: world.opponent.id, daysAgo: -1 })

		const context = await askAbout()

		expect(context?.matchup?.sides[0]?.differential).toBeNull()
	})

	it("takes the role record and streak from ESPN when a reading predates the lock", async () => {
		await bothPlayed()
		await standingsRow({
			teamId: world.team.id,
			daysAgo: 2,
			homeWins: 9,
			homeLosses: 1,
			streak: "L2",
		})
		await standingsRow({ teamId: world.opponent.id, daysAgo: 2 })

		const context = await askAbout()
		const [ours] = context?.matchup?.sides ?? []

		// The home team gets its home record, not the 1-0 the game rows imply.
		expect(ours?.inThisRole).toMatchObject({ games: 10, wins: 9, losses: 1 })
		expect(ours?.streak).toEqual({ outcome: "loss", length: 2 })
	})

	it("falls back to the game rows when no reading predates the lock", async () => {
		await bothPlayed()

		const context = await askAbout()
		const [ours] = context?.matchup?.sides ?? []

		expect(ours?.differential).toBeNull()
		// One home game, won, off this app's own rows.
		expect(ours?.inThisRole).toMatchObject({ games: 1, wins: 1, losses: 0 })
		expect(ours?.streak).toEqual({ outcome: "win", length: 1 })
	})


	// Two division rivals can play thirteen times while the list under the
	// columns shows five, so the record has to count every meeting rather than
	// the ones on screen.
	it("counts the series over every meeting, not the listed few", async () => {
		// Six meetings: ours wins four, loses one, ties one.
		await finished(world, { daysAgo: 30, homeScore: 5, awayScore: 3 })
		await finished(world, { daysAgo: 28, homeScore: 6, awayScore: 1 })
		await finished(world, { daysAgo: 26, homeScore: 2, awayScore: 9 })
		await finished(world, { daysAgo: 24, homeScore: 4, awayScore: 4 })
		await finished(world, {
			daysAgo: 22,
			homeTeamId: world.opponent.id,
			awayTeamId: world.team.id,
			homeScore: 1,
			awayScore: 7,
		})
		await finished(world, {
			daysAgo: 20,
			homeTeamId: world.opponent.id,
			awayTeamId: world.team.id,
			homeScore: 0,
			awayScore: 3,
		})

		const context = await askAbout()
		const [ours, theirs] = context?.matchup?.sides ?? []

		expect(ours?.headToHead).toEqual({
			games: 6,
			wins: 4,
			losses: 1,
			ties: 1,
		})
		// The mirror, so neither column has to be read off the other.
		expect(theirs?.headToHead).toEqual({
			games: 6,
			wins: 1,
			losses: 4,
			ties: 1,
		})
		// The list itself stays capped.
		expect(context?.matchup?.meetings).toHaveLength(5)
	})

	it("has no series record when the two have not met", async () => {
		await bothPlayed()

		const context = await askAbout()

		expect(context?.matchup?.sides[0]?.headToHead).toBeNull()
	})

	it("reports a last ten only once ten games stand behind it", async () => {
		await bothPlayed()

		const context = await askAbout()

		expect(context?.matchup?.sides[0]?.lastTen).toBeNull()
	})

	it("counts combined totals that cleared the line for a game total", async () => {
		const other = await makeTeam({ leagueId: world.league.id })
		// Combined 50, then 40, against a line of 44.5.
		await finished(world, { daysAgo: 9, homeScore: 30, awayScore: 20 })
		await finished(world, { daysAgo: 5, homeScore: 20, awayScore: 20 })
		await finished(world, {
			daysAgo: 3,
			homeTeamId: other.id,
			awayTeamId: world.opponent.id,
			homeScore: 10,
			awayScore: 14,
		})

		const context = await askAbout({
			shape: "game_total_over_under",
			ouLine: 44.5,
		})

		expect(context?.matchup?.focus).toBe("scoring")
		expect(context?.matchup?.sides[0]?.overall?.overLine).toBe(1)
	})

	// A who-wins question has no line, so there is no count to report.
	it("carries no cleared count for a question with no line", async () => {
		await bothPlayed()

		const context = await askAbout()

		expect(context?.matchup?.sides[0]?.overall?.overLine).toBeNull()
	})
})

describe("derivedDifferentialFrom", () => {
	const game = (pointsFor: number, pointsAgainst: number) => ({
		pointsFor,
		pointsAgainst,
	})

	// The same measurement by another route: a season total is the sum of the
	// game-by-game gaps, so a question that locked before any standings reading
	// existed still gets a real run differential.
	it("sums the game-by-game gaps into a season total", () => {
		const d = derivedDifferentialFrom("mlb", [
			game(8, 5),
			game(2, 9),
			game(6, 0),
		])

		expect(d).toMatchObject({ kind: "run_differential", value: 2, games: 3 })
	})

	it("keeps football on points", () => {
		const d = derivedDifferentialFrom("nfl", [game(20, 17), game(13, 34)])

		expect(d).toMatchObject({ kind: "point_differential", value: -18 })
	})

	// The one metric with no fallback. Possessions are not on a game row, and a
	// per-game margin published as a net rating would be a different statistic.
	it("refuses to stand in for a net rating", () => {
		expect(derivedDifferentialFrom("nba", [game(117, 109)])).toBeNull()
	})

	it("gives a league with no mapped metric nothing", () => {
		expect(derivedDifferentialFrom("nhl", [game(4, 2)])).toBeNull()
	})

	it("has nothing to report before a team has played", () => {
		expect(derivedDifferentialFrom("mlb", [])).toBeNull()
	})
})

describe("differentialFrom", () => {
	const reading = (
		overrides: Partial<TeamSeasonStats> = {},
	): TeamSeasonStats => ({
		id: randomUUID(),
		teamId: randomUUID(),
		seasonId: randomUUID(),
		asOf: NOW,
		gamesPlayed: 82,
		pointsFor: 9657,
		pointsAgainst: 8988,
		pointDifferential: 669,
		homeWins: 31,
		homeLosses: 9,
		homeTies: 0,
		roadWins: 28,
		roadLosses: 13,
		roadTies: 0,
		streak: "W3",
		lastTen: "8-2",
		possessions: 8451,
		updatedAt: NOW,
		...overrides,
	})

	// The reason the kind exists: this is a rate per 100 possessions, and the
	// same team's per-game margin is +8.2, a different number entirely.
	it("measures basketball as a rate per 100 possessions", () => {
		const d = differentialFrom("nba", reading())

		expect(d?.kind).toBe("net_rating")
		expect(d?.value).toBeCloseTo(7.92, 2)
	})

	it("has no net rating without a possession count", () => {
		expect(differentialFrom("nba", reading({ possessions: null }))).toBeNull()
	})

	it("measures baseball as a season run total", () => {
		const d = differentialFrom(
			"mlb",
			reading({ pointDifferential: 81, possessions: null }),
		)

		expect(d).toMatchObject({ kind: "run_differential", value: 81 })
	})

	it("measures football as a season point total", () => {
		const d = differentialFrom(
			"nfl",
			reading({ pointDifferential: 24, possessions: null }),
		)

		expect(d).toMatchObject({ kind: "point_differential", value: 24 })
	})

	// A default would have to pick someone else's unit. Hockey's is goals, and
	// a card confidently reading "point differential" over it is worse than a
	// card with no figure on it.
	it("gives a league with no mapped metric no figure at all", () => {
		expect(differentialFrom("nhl", reading())).toBeNull()
	})

	// ESPN's own total, not pointsFor minus pointsAgainst, so a card and the
	// standings page agree even where those two disagree.
	it("takes the total from ESPN rather than recomputing it", () => {
		const d = differentialFrom(
			"nfl",
			reading({ pointsFor: 64, pointsAgainst: 40, pointDifferential: 21 }),
		)

		expect(d?.value).toBe(21)
	})
})

// The recipe is what decides whether a card is built at all, so a team
// scoring question asking for the opposing defense is held to here rather
// than only in the query that would answer it.
describe("recipeFor", () => {
	it("gives each league's team scoring stat the opposing defense", () => {
		for (const key of [
			"nfl:game:team:Points",
			"nba:game:team:Points",
			"mlb:game:team:Runs",
		]) {
			expect(recipeFor(key)).toContain("opponent_allowed")
		}
	})

	it("leaves a stat with no recipe of its own on the default", () => {
		expect(recipeFor("nfl:game:team:Passing Yards")).not.toContain(
			"opponent_allowed",
		)
	})
})
