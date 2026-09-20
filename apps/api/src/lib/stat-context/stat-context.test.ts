import { beforeEach, describe, expect, it } from "vitest"
import { db } from "../../db"
import { playerGameStats, teamGameStats } from "../../db/schema"
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
	homeAwaySplit,
	opponentAllowed,
	recentGames,
	restSplit,
	type StatContextScope,
	seasonToDate,
	shareOfTeamTotal,
} from "./queries"
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
		statKey: STAT_KEY,
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
		).toMatchObject({ statKey: "points", subject: "player", origin: "athlete" })
	})

	it("resolves an MLB counting stat to its table-prefixed column", () => {
		expect(
			boxStatSourceFor({
				...base,
				leagueSlug: "mlb",
				shape: "player_stat_over_under",
				statName: "Hits",
			}),
		).toMatchObject({ statKey: "batting.hits" })
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
			game: { homeTeamId: world.team.id, awayTeamId: world.opponent.id },
			subject: refFor(world.player, "Subject", world.team.id),
			competitors: [],
			optionSubjects: [],
		})

		expect(context?.subjects).toHaveLength(1)
		expect(context?.subjects[0]?.recentGames).toHaveLength(1)
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
			game: { homeTeamId: world.team.id, awayTeamId: world.opponent.id },
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
			game: { homeTeamId: world.team.id, awayTeamId: world.opponent.id },
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
			game: { homeTeamId: world.team.id, awayTeamId: world.opponent.id },
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
		expect(context?.ranking.map((r) => r.mean)).toEqual([30, 10])
		// A zero would rank an unknown player as genuinely bad.
		expect(context?.ranking).toHaveLength(2)
	})

	it("returns nothing when no one in the pool has played", async () => {
		const context = await buildStatContext({
			...questionBase,
			shape: "player_game_stat_leader",
			seasonId: world.season.id,
			game: { homeTeamId: world.team.id, awayTeamId: world.opponent.id },
			subject: null,
			competitors: [],
			optionSubjects: [refFor(world.player, "Subject", world.team.id)],
		})

		expect(context).toBeNull()
	})
})
