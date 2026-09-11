import { beforeEach, describe, expect, it, vi } from "vitest"
import {
	HOUR,
	makeGame,
	makeLeague,
	makePlayer,
	makeTeam,
} from "../../test/factories"
import { db } from "../index"
import { externalRefs, gameStarters, type League, type Team } from "../schema"
import {
	type EspnDepthChart,
	type EspnProbablesEvent,
	EspnRequestError,
	fetchDepthChart,
	fetchGameSummaryRosters,
	fetchScoreboardRange,
} from "./espn-client"
import { isStartersRefreshDue, syncGameStarters } from "./sync-game-starters"

vi.mock("./espn-client", async (importOriginal) => ({
	...(await importOriginal<typeof import("./espn-client")>()),
	fetchScoreboardRange: vi.fn(),
	fetchGameSummaryRosters: vi.fn(),
	fetchDepthChart: vi.fn(),
}))

// Noon Eastern, so a game 10h out starts late the same ET evening but on the
// next UTC day - the scoreboard range has to be built from ET dates.
const NOW = new Date("2026-09-11T16:00:00Z")
const hoursFromNow = (hours: number) => new Date(NOW.getTime() + hours * HOUR)

const run = () => syncGameStarters({ now: NOW, spacingMs: 0 })

async function link(
	entityType: "team" | "player" | "game",
	sourceId: string,
	entityId: string,
) {
	await db
		.insert(externalRefs)
		.values({ source: "espn", entityType, sourceId, entityId })
}

async function seedTeam(league: League, espnTeamId: string) {
	const team = await makeTeam({ leagueId: league.id })
	await link("team", `${league.slug}:${espnTeamId}`, team.id)
	return team
}

async function seedGame(
	league: League,
	home: Team,
	away: Team,
	espnEventId: string,
	hoursUntilStart: number,
	startersSyncedAt: Date | null = null,
) {
	const game = await makeGame({
		leagueId: league.id,
		homeTeamId: home.id,
		awayTeamId: away.id,
		startsAt: hoursFromNow(hoursUntilStart),
		startersSyncedAt,
	})
	await link("game", `${league.slug}:${espnEventId}`, game.id)
	return game
}

const startersFor = (gameId: string) =>
	db.query.gameStarters.findMany({
		where: { gameId },
		orderBy: { sortOrder: "asc" },
	})

const syncedAtOf = async (gameId: string) =>
	(await db.query.games.findFirst({ where: { id: gameId } }))
		?.startersSyncedAt ?? null

const probablesEvent = (
	id: string,
	home: [string, string] | null,
	away: [string, string] | null,
): EspnProbablesEvent => {
	const probables = (pitcher: [string, string] | null) =>
		pitcher
			? [
					{
						name: "probableStartingPitcher",
						abbreviation: "SP",
						athlete: { id: pitcher[0], displayName: pitcher[1] },
						statistics: [
							{ abbreviation: "W", displayValue: "5" },
							{ abbreviation: "L", displayValue: "3" },
							{ abbreviation: "ERA", displayValue: "3.09" },
						],
					},
				]
			: []
	return {
		id,
		competitions: [
			{
				competitors: [
					{ homeAway: "home", team: { id: "10" }, probables: probables(home) },
					{ homeAway: "away", team: { id: "20" }, probables: probables(away) },
				],
			},
		],
	}
}

const nbaChart = (prefix: string): EspnDepthChart[] => [
	{
		name: "Depth Chart",
		positions: Object.fromEntries(
			["pg", "sg", "sf", "pf", "c"].map((key, i) => [
				key,
				{
					position: { abbreviation: key.toUpperCase() },
					athletes: [{ id: `${prefix}${i}`, displayName: `${prefix} ${key}` }],
				},
			]),
		),
	},
]

beforeEach(() => {
	vi.mocked(fetchScoreboardRange).mockReset()
	vi.mocked(fetchGameSummaryRosters).mockReset()
	vi.mocked(fetchDepthChart).mockReset()
})

describe("isStartersRefreshDue", () => {
	it.each([
		["probables", 48, null, true],
		["probables", 48, 23, false],
		["probables", 48, 24, true],
		["probables", 10, 3, false],
		["probables", 10, 4, true],
		["probables", 2, 0.5, true],
		["depth_chart", 10, 5, false],
		["depth_chart", 10, 6, true],
		["depth_chart", 2, 1, false],
	] as const)("%s, %dh before start, synced %sh ago: due=%s", (source, hoursUntilStart, hoursSinceSync, due) => {
		const game = {
			startsAt: hoursFromNow(hoursUntilStart),
			startersSyncedAt:
				hoursSinceSync === null ? null : hoursFromNow(-hoursSinceSync),
		}
		expect(isStartersRefreshDue(game, source, NOW)).toBe(due)
	})
})

describe("syncGameStarters: MLB", () => {
	it("stores probables from one scoreboard call and skips the lineup call outside the lineup window", async () => {
		const league = await makeLeague({ slug: "mlb" })
		const home = await seedTeam(league, "10")
		const away = await seedTeam(league, "20")
		const game = await seedGame(league, home, away, "401", 10)
		const rodon = await makePlayer({ name: "Carlos Rodon" })
		await link("player", "mlb:33696", rodon.id)

		vi.mocked(fetchScoreboardRange).mockResolvedValue([
			probablesEvent(
				"401",
				["33696", "Carlos Rodon"],
				["777", "Fresh Call-Up"],
			),
		])

		await run()

		expect(fetchScoreboardRange).toHaveBeenCalledOnce()
		expect(fetchScoreboardRange).toHaveBeenCalledWith(
			"baseball/mlb",
			"20260911",
			"20260911",
		)
		expect(fetchGameSummaryRosters).not.toHaveBeenCalled()

		const starters = await startersFor(game.id)
		expect(
			starters.map((s) => ({
				teamId: s.teamId,
				role: s.role,
				playerName: s.playerName,
				playerId: s.playerId,
				statLine: s.statLine,
			})),
		).toEqual(
			expect.arrayContaining([
				{
					teamId: home.id,
					role: "starting_pitcher",
					playerName: "Carlos Rodon",
					playerId: rodon.id,
					statLine: "5-3, 3.09 ERA",
				},
				{
					teamId: away.id,
					role: "starting_pitcher",
					playerName: "Fresh Call-Up",
					playerId: null,
					statLine: "5-3, 3.09 ERA",
				},
			]),
		)
		expect(starters).toHaveLength(2)
		expect(await syncedAtOf(game.id)).toEqual(NOW)
	})

	it("inside the lineup window, adds posted lineups, clears a TBD pitcher, and keeps a lineup ESPN has stopped listing", async () => {
		const league = await makeLeague({ slug: "mlb" })
		const home = await seedTeam(league, "10")
		const away = await seedTeam(league, "20")
		const game = await seedGame(league, home, away, "402", 2)
		await db.insert(gameStarters).values([
			{
				gameId: game.id,
				teamId: away.id,
				role: "starting_pitcher",
				sortOrder: 1,
				playerName: "Scratched Pitcher",
			},
			{
				gameId: game.id,
				teamId: away.id,
				role: "batter",
				sortOrder: 1,
				playerName: "Earlier Leadoff",
			},
		])

		vi.mocked(fetchScoreboardRange).mockResolvedValue([
			probablesEvent("402", ["33696", "Carlos Rodon"], null),
		])
		vi.mocked(fetchGameSummaryRosters).mockResolvedValue([
			{
				homeAway: "home",
				team: { id: "10" },
				roster: [
					{
						starter: true,
						batOrder: 2,
						position: { abbreviation: "RF" },
						athlete: { id: "2", displayName: "Aaron Judge" },
					},
					{
						starter: true,
						batOrder: 1,
						position: { abbreviation: "CF" },
						athlete: { id: "1", displayName: "Trent Grisham" },
					},
				],
			},
			{ homeAway: "away", team: { id: "20" }, roster: [] },
		])

		await run()

		expect(fetchGameSummaryRosters).toHaveBeenCalledWith("baseball/mlb", "402")
		const starters = await startersFor(game.id)
		const rowsFor = (teamId: string, role: string) =>
			starters
				.filter((s) => s.teamId === teamId && s.role === role)
				.map((s) => s.playerName)

		expect(rowsFor(home.id, "starting_pitcher")).toEqual(["Carlos Rodon"])
		expect(rowsFor(home.id, "batter")).toEqual(["Trent Grisham", "Aaron Judge"])
		expect(rowsFor(away.id, "starting_pitcher")).toEqual([])
		expect(rowsFor(away.id, "batter")).toEqual(["Earlier Leadoff"])
		expect(await syncedAtOf(game.id)).toEqual(NOW)
	})

	it("makes no request for a game refreshed recently enough", async () => {
		const league = await makeLeague({ slug: "mlb" })
		const home = await seedTeam(league, "10")
		const away = await seedTeam(league, "20")
		await seedGame(league, home, away, "403", 10, hoursFromNow(-1))

		await run()

		expect(fetchScoreboardRange).not.toHaveBeenCalled()
	})

	it("keeps probables but leaves the game due when the lineup call fails", async () => {
		const league = await makeLeague({ slug: "mlb" })
		const home = await seedTeam(league, "10")
		const away = await seedTeam(league, "20")
		const game = await seedGame(league, home, away, "404", 1)

		vi.mocked(fetchScoreboardRange).mockResolvedValue([
			probablesEvent("404", ["33696", "Carlos Rodon"], ["5", "Other Arm"]),
		])
		vi.mocked(fetchGameSummaryRosters).mockRejectedValue(
			new EspnRequestError("summary", 500),
		)

		await run()

		expect(await startersFor(game.id)).toHaveLength(2)
		expect(await syncedAtOf(game.id)).toBeNull()
	})
})

describe("syncGameStarters: depth charts", () => {
	it("fetches each team's chart once across its games and ignores games past the horizon", async () => {
		const league = await makeLeague({ slug: "nba" })
		const a = await seedTeam(league, "1")
		const b = await seedTeam(league, "2")
		const c = await seedTeam(league, "3")
		const tonight = await seedGame(league, a, b, "501", 8)
		const tomorrow = await seedGame(league, c, a, "502", 32)
		const later = await seedGame(league, b, c, "503", 72)

		vi.mocked(fetchDepthChart).mockImplementation(async (_path, espnTeamId) =>
			nbaChart(`team${espnTeamId}`),
		)

		await run()

		expect(fetchDepthChart).toHaveBeenCalledTimes(3)
		expect(await startersFor(tonight.id)).toHaveLength(10)
		expect(await startersFor(tomorrow.id)).toHaveLength(10)
		expect(await startersFor(later.id)).toHaveLength(0)
		expect(await syncedAtOf(tonight.id)).toEqual(NOW)
		expect(await syncedAtOf(later.id)).toBeNull()
	})

	it("stops the whole run when ESPN refuses a request", async () => {
		const league = await makeLeague({ slug: "nfl" })
		const home = await seedTeam(league, "19")
		const away = await seedTeam(league, "21")
		const game = await seedGame(league, home, away, "601", 48)

		vi.mocked(fetchDepthChart).mockRejectedValue(
			new EspnRequestError("nfl depth chart", 403),
		)

		await expect(run()).rejects.toBeInstanceOf(EspnRequestError)
		expect(fetchDepthChart).toHaveBeenCalledOnce()
		expect(await syncedAtOf(game.id)).toBeNull()
	})
})
