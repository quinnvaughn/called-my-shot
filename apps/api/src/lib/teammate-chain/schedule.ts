import { and, eq, gte, notInArray, sql } from "drizzle-orm"
import { db } from "../../db"
import {
	leagues,
	playerFranchiseStints,
	players,
	playerTeamSeasons,
	teammateChainPuzzles,
	teammateChainResults,
	teams,
} from "../../db/schema"
import { addArcadeDays, arcadeDay } from "../arcade/day"
import { FILL_CHAIN_SCHEDULE_LOCK } from "../job-lock"
import { runCli } from "../run-cli"
import { isSeasonLeague } from "../season-puzzles/archive-parse"
import {
	type BuiltChainPuzzle,
	buildChainPuzzle,
	buildLeagueGraph,
	type ChainPuzzleRules,
	type LeagueGraph,
} from "./graph"

// How far ahead the schedule is kept full, so the admin page shows what's
// coming well before it runs.
export const CHAIN_SCHEDULE_AHEAD_DAYS = 14
// A player isn't an end again within this many days of another run.
export const CHAIN_PLAYER_REST_DAYS = 30

// The ends come from each league's best-known players: the most career
// stint score, among those who played since CHAIN_ERA_START. The players in
// between can be anyone.
export const CHAIN_POOL_SIZE = 150
export const CHAIN_ERA_START = 1980

export const CHAIN_RULES: ChainPuzzleRules = {
	minPar: 3,
	maxPar: 4,
	minRoutePlayers: 4,
}

type Scheduled = {
	day: string
	leagueId: string
	startPlayerId: string
	targetPlayerId: string
}

// The order leagues are tried in for `day`: the one that ran longest ago
// first, and never the league that ran the day before while another can.
// Pure, so the rotation is testable.
export function chainLeagueOrder(
	day: string,
	scheduled: readonly Scheduled[],
	leagueIds: readonly string[],
): string[] {
	const yesterday = scheduled.find(
		(s) => s.day === addArcadeDays(day, -1),
	)?.leagueId
	const lastRun = (leagueId: string) =>
		scheduled
			.filter((s) => s.leagueId === leagueId && s.day < day)
			.reduce((last, s) => (s.day > last ? s.day : last), "")
	return [...leagueIds].sort(
		(a, b) =>
			Number(a === yesterday) - Number(b === yesterday) ||
			lastRun(a).localeCompare(lastRun(b)) ||
			a.localeCompare(b),
	)
}

// Ends that ran within CHAIN_PLAYER_REST_DAYS of `day`.
export function restingPlayers(
	scheduled: readonly Scheduled[],
	day: string,
): Set<string> {
	const from = addArcadeDays(day, -CHAIN_PLAYER_REST_DAYS + 1)
	const to = addArcadeDays(day, CHAIN_PLAYER_REST_DAYS - 1)
	return new Set(
		scheduled
			.filter((s) => s.day >= from && s.day <= to)
			.flatMap((s) => [s.startPlayerId, s.targetPlayerId]),
	)
}

// One league, loaded for building its puzzles.
export type ChainLeague = {
	leagueId: string
	graph: LeagueGraph
	pool: string[]
	scoreOf: (playerId: string) => number
}

export async function loadChainLeague(leagueId: string): Promise<ChainLeague> {
	const [rows, current, scores] = await Promise.all([
		db
			.select({
				playerId: playerTeamSeasons.playerId,
				teamId: playerTeamSeasons.teamId,
				season: playerTeamSeasons.season,
			})
			.from(playerTeamSeasons)
			.innerJoin(teams, eq(teams.id, playerTeamSeasons.teamId))
			.where(eq(teams.leagueId, leagueId)),
		db
			.select({ playerId: players.id, teamId: teams.id })
			.from(players)
			.innerJoin(teams, eq(teams.id, players.currentTeamId))
			.where(eq(teams.leagueId, leagueId)),
		db
			.select({
				playerId: playerFranchiseStints.playerId,
				score: sql<number>`sum(${playerFranchiseStints.score})::float`,
				lastSeason: sql<number>`max(${playerFranchiseStints.lastSeason})`,
			})
			.from(playerFranchiseStints)
			.innerJoin(teams, eq(teams.id, playerFranchiseStints.teamId))
			.where(eq(teams.leagueId, leagueId))
			.groupBy(playerFranchiseStints.playerId),
	])
	const scoreById = new Map(scores.map((row) => [row.playerId, row.score]))
	const pool = scores
		.filter((row) => row.lastSeason >= CHAIN_ERA_START)
		.sort((a, b) => b.score - a.score)
		.slice(0, CHAIN_POOL_SIZE)
		.map((row) => row.playerId)
	return {
		leagueId,
		graph: buildLeagueGraph([
			...rows,
			...current.map((row) => ({ ...row, season: "now" })),
		]),
		pool,
		scoreOf: (playerId) => scoreById.get(playerId) ?? 0,
	}
}

// The leagues a puzzle can come from: active ones with roster history.
export async function chainLeagueIds(): Promise<string[]> {
	const rows = await db
		.selectDistinct({ id: leagues.id, slug: leagues.slug })
		.from(leagues)
		.innerJoin(teams, eq(teams.leagueId, leagues.id))
		.innerJoin(playerTeamSeasons, eq(playerTeamSeasons.teamId, teams.id))
		.where(eq(leagues.status, "active"))
	return rows.filter((row) => isSeasonLeague(row.slug)).map((row) => row.id)
}

export async function usedChainSignatures(): Promise<Set<string>> {
	const rows = await db
		.select({ signature: teammateChainPuzzles.signature })
		.from(teammateChainPuzzles)
	return new Set(rows.map((row) => row.signature))
}

// What's scheduled from CHAIN_PLAYER_REST_DAYS ago on, for the rest rule and
// the rotation.
export async function recentChainSchedule(today: string): Promise<Scheduled[]> {
	return db
		.select({
			day: teammateChainPuzzles.playDate,
			leagueId: teammateChainPuzzles.leagueId,
			startPlayerId: teammateChainPuzzles.startPlayerId,
			targetPlayerId: teammateChainPuzzles.targetPlayerId,
		})
		.from(teammateChainPuzzles)
		.where(
			gte(
				teammateChainPuzzles.playDate,
				addArcadeDays(today, -CHAIN_PLAYER_REST_DAYS),
			),
		)
}

// A new puzzle for `day` from the first league in `leagueIds` that has one
// left. Leagues are loaded as they're needed and kept in `loaded`.
export async function buildChainPuzzleFor(
	day: string,
	leagueIds: readonly string[],
	scheduled: readonly Scheduled[],
	used: ReadonlySet<string>,
	loaded: Map<string, ChainLeague> = new Map(),
): Promise<(BuiltChainPuzzle & { leagueId: string }) | null> {
	const resting = restingPlayers(scheduled, day)
	for (const leagueId of leagueIds) {
		let league = loaded.get(leagueId)
		if (!league) {
			league = await loadChainLeague(leagueId)
			loaded.set(leagueId, league)
		}
		const built = buildChainPuzzle(
			league.graph,
			league.pool,
			CHAIN_RULES,
			used,
			resting,
			league.scoreOf,
		)
		if (built) return { ...built, leagueId }
	}
	return null
}

export async function fillChainSchedule(now = new Date()) {
	const today = arcadeDay(now)
	const [scheduled, leagueIds, used] = await Promise.all([
		recentChainSchedule(today),
		chainLeagueIds(),
		usedChainSignatures(),
	])
	const days = new Set(scheduled.map((s) => s.day))
	const loaded = new Map<string, ChainLeague>()
	let count = 0
	for (let offset = 0; offset < CHAIN_SCHEDULE_AHEAD_DAYS; offset++) {
		const day = addArcadeDays(today, offset)
		if (days.has(day)) continue
		const built = await buildChainPuzzleFor(
			day,
			chainLeagueOrder(day, scheduled, leagueIds),
			scheduled,
			used,
			loaded,
		)
		if (!built) continue
		const inserted = await db
			.insert(teammateChainPuzzles)
			.values({ ...built, playDate: day })
			.onConflictDoNothing()
			.returning({ id: teammateChainPuzzles.id })
		if (inserted.length === 0) continue
		scheduled.push({ day, ...built })
		used.add(built.signature)
		count++
	}
	return { scheduled: count }
}

// Unschedules every day from today on that nobody has played, so the next
// fill picks them again from the rosters as they are now.
export async function clearUnplayedChainSchedule(now = new Date()) {
	const played = db
		.selectDistinct({ id: teammateChainResults.puzzleId })
		.from(teammateChainResults)
	const cleared = await db
		.delete(teammateChainPuzzles)
		.where(
			and(
				gte(teammateChainPuzzles.playDate, arcadeDay(now)),
				notInArray(teammateChainPuzzles.id, played),
			),
		)
		.returning({ id: teammateChainPuzzles.id })
	return { cleared: cleared.length }
}

//   pnpm chain:schedule              fills the empty days
//   pnpm chain:schedule -- --reset   clears the unplayed days first
runCli(
	import.meta.url,
	async () => {
		if (process.argv.includes("--reset")) {
			const { cleared } = await clearUnplayedChainSchedule()
			console.log(`Cleared ${cleared} unplayed Teammate Chain days.`)
		}
		const { scheduled } = await fillChainSchedule()
		console.log(`Scheduled ${scheduled} Teammate Chain puzzles.`)
	},
	{ lock: FILL_CHAIN_SCHEDULE_LOCK },
)
