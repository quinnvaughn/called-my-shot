import { eq, gte } from "drizzle-orm"
import { db } from "../../db"
import {
	leagues,
	playerCareers,
	playerSeasonLeaders,
	rankPuzzles,
	teamSeasons,
	teams,
} from "../../db/schema"
import { addArcadeDays, arcadeDay } from "../arcade/day"
import { FILL_RANK_SCHEDULE_LOCK } from "../job-lock"
import { runCli } from "../run-cli"
import {
	isSeasonLeague,
	type SeasonLeague,
} from "../season-puzzles/archive-parse"
import {
	careerStatPuzzle,
	FRANCHISE_STATS,
	franchisePuzzle,
	type GeneratedRank,
	type RankKind,
	seasonStatPuzzle,
	TEAM_SEASON_STATS,
	teamSeasonPuzzle,
} from "./generate"
import { PLAYER_RANK_STATS } from "./rank-stats"

export const RANK_SCHEDULE_AHEAD_DAYS = 14
// How far back the rotation looks: long enough to see every league's last
// run of every kind.
const RANK_HISTORY_DAYS = 30
export const RANK_KINDS: RankKind[] = [
	"season_stat",
	"career_stat",
	"team_season",
	"franchise",
]

type Slotted = { day: string; leagueId: string; kind: RankKind }

// Which league and which kind of prompt each empty day from `today` through
// the next RANK_SCHEDULE_AHEAD_DAYS gets. Pure, so the rotation is
// testable:
// - leagues take turns: the one that ran longest ago goes next, never the
//   same one two days running when there's another;
// - within a league, kinds take turns the same way, and no kind runs two
//   days in a row whatever the league.
// Each day carries its kinds in order of preference, so a kind whose pool
// can't make a puzzle that day falls through to the next.
export function planRankSlots(
	today: string,
	scheduled: readonly Slotted[],
	leagueIds: readonly string[],
): { day: string; leagueId: string; kinds: RankKind[] }[] {
	const byDay = new Map(scheduled.map((s) => [s.day, s]))
	const plan: { day: string; leagueId: string; kinds: RankKind[] }[] = []
	const lastRun = <T>(pick: (s: Slotted) => T, value: T, before: string) => {
		let last = ""
		for (const s of byDay.values()) {
			if (pick(s) === value && s.day < before && s.day > last) last = s.day
		}
		return last
	}
	const sortedLeagues = [...leagueIds].sort()

	for (let offset = 0; offset < RANK_SCHEDULE_AHEAD_DAYS; offset++) {
		const day = addArcadeDays(today, offset)
		if (byDay.has(day) || sortedLeagues.length === 0) continue
		const yesterday = byDay.get(addArcadeDays(day, -1))
		const turnOrder = <T>(options: T[], pick: (s: Slotted) => T) =>
			[...options].sort(
				(a, b) =>
					Number(yesterday && pick(yesterday) === a) -
						Number(yesterday && pick(yesterday) === b) ||
					lastRun(pick, a, day).localeCompare(lastRun(pick, b, day)),
			)
		const leagueId = turnOrder(sortedLeagues, (s) => s.leagueId)[0]
		if (!leagueId) continue
		// Within the league, the kind it ran longest ago, never yesterday's.
		const kinds = [...RANK_KINDS].sort(
			(a, b) =>
				Number(yesterday?.kind === a) - Number(yesterday?.kind === b) ||
				lastRun(
					(s) => `${s.leagueId}:${s.kind}`,
					`${leagueId}:${a}`,
					day,
				).localeCompare(
					lastRun((s) => `${s.leagueId}:${s.kind}`, `${leagueId}:${b}`, day),
				),
		)
		plan.push({ day, leagueId, kinds })
		byDay.set(day, { day, leagueId, kind: kinds[0] ?? "season_stat" })
	}
	return plan
}

function randomOf<T>(list: readonly T[], random: () => number): T | undefined {
	return list[Math.floor(random() * list.length)]
}

// A season prompt draws from this deep in the season's leaderboard, so the
// five are players who stood out that year.
const SEASON_POOL_DEPTH = 20

// How many tries one kind gets to land on a puzzle that hasn't run.
const ATTEMPTS_PER_KIND = 8

// A league's pools, read once per fill.
async function loadPools(leagueId: string) {
	const [leaders, careers, seasons, teamRows] = await Promise.all([
		db
			.select()
			.from(playerSeasonLeaders)
			.where(eq(playerSeasonLeaders.leagueId, leagueId)),
		db.select().from(playerCareers).where(eq(playerCareers.leagueId, leagueId)),
		db.select().from(teamSeasons).where(eq(teamSeasons.leagueId, leagueId)),
		db
			.select({ id: teams.id, name: teams.name })
			.from(teams)
			.where(eq(teams.leagueId, leagueId)),
	])
	// What each player's team was called in the seasons they led it most,
	// for a career prompt: Art Monk's Washington Redskins, not today's name.
	const counts = new Map<string, Map<string, number>>()
	for (const row of leaders) {
		if (!row.teamName) continue
		const names = counts.get(row.espnAthleteId) ?? new Map<string, number>()
		names.set(row.teamName, (names.get(row.teamName) ?? 0) + 1)
		counts.set(row.espnAthleteId, names)
	}
	const careerTeamNames = new Map(
		[...counts.entries()].flatMap(([id, names]) => {
			const top = [...names.entries()].sort((a, b) => b[1] - a[1])[0]
			return top ? [[id, top[0]] as const] : []
		}),
	)
	return {
		leaders,
		careers,
		seasons,
		teamNames: new Map(teamRows.map((t) => [t.id, t.name])),
		careerTeamNames,
	}
}
type Pools = Awaited<ReturnType<typeof loadPools>>

function generateKind(
	league: SeasonLeague,
	kind: RankKind,
	pools: Pools,
	random: () => number,
): GeneratedRank | null {
	if (kind === "season_stat") {
		const stat = randomOf(PLAYER_RANK_STATS[league], random)
		if (!stat) return null
		const rows = pools.leaders.filter(
			(l) => l.category === stat.category && l.rank < SEASON_POOL_DEPTH,
		)
		const year = randomOf([...new Set(rows.map((r) => r.year))], random)
		if (year === undefined) return null
		return seasonStatPuzzle(
			league,
			stat,
			year,
			rows.filter((r) => r.year === year),
			random,
		)
	}
	if (kind === "career_stat") {
		const stat = randomOf(PLAYER_RANK_STATS[league], random)
		if (!stat) return null
		return careerStatPuzzle(
			league,
			stat,
			pools.careers,
			pools.careerTeamNames,
			random,
		)
	}
	if (kind === "team_season") {
		const stat = randomOf(TEAM_SEASON_STATS, random)
		const year = randomOf(
			[...new Set(pools.seasons.map((s) => s.year))],
			random,
		)
		if (!stat || year === undefined) return null
		return teamSeasonPuzzle(
			league,
			stat,
			year,
			pools.seasons.filter((s) => s.year === year),
			random,
		)
	}
	const stat = randomOf(FRANCHISE_STATS, random)
	if (!stat) return null
	return franchisePuzzle(league, stat, pools.seasons, pools.teamNames, random)
}

// A puzzle for `league` that hasn't run, trying `kinds` in order.
export function buildRankPuzzle(
	league: SeasonLeague,
	kinds: readonly RankKind[],
	pools: Pools,
	usedSignatures: ReadonlySet<string>,
	random: () => number = Math.random,
): GeneratedRank | null {
	for (const kind of kinds) {
		for (let attempt = 0; attempt < ATTEMPTS_PER_KIND; attempt++) {
			const puzzle = generateKind(league, kind, pools, random)
			if (puzzle && !usedSignatures.has(puzzle.signature)) return puzzle
		}
	}
	return null
}

async function activeLeagues() {
	const rows = await db
		.select({ id: leagues.id, slug: leagues.slug })
		.from(leagues)
		.where(eq(leagues.status, "active"))
	return rows.flatMap((r) =>
		isSeasonLeague(r.slug) ? [{ id: r.id, slug: r.slug }] : [],
	)
}

export async function usedRankSignatures(): Promise<Set<string>> {
	const rows = await db.select({ s: rankPuzzles.signature }).from(rankPuzzles)
	return new Set(rows.map((r) => r.s))
}

// A puzzle for one day, in `leagueId`'s league or the next one that can make
// one. Used by the daily fill and by an admin's reroll.
export async function buildRankPuzzleFor(
	leagueId: string,
	kinds: readonly RankKind[],
	used: ReadonlySet<string>,
	poolCache = new Map<string, Pools>(),
) {
	const all = await activeLeagues()
	const ordered = [
		...all.filter((l) => l.id === leagueId),
		...all.filter((l) => l.id !== leagueId),
	]
	for (const league of ordered) {
		if (!isSeasonLeague(league.slug)) continue
		const pools = poolCache.get(league.id) ?? (await loadPools(league.id))
		poolCache.set(league.id, pools)
		const puzzle = buildRankPuzzle(league.slug, kinds, pools, used)
		if (puzzle) return { leagueId: league.id, puzzle }
	}
	return null
}

export async function fillRankSchedule(now = new Date()) {
	const today = arcadeDay(now)
	const [scheduled, all, used] = await Promise.all([
		db
			.select({
				day: rankPuzzles.playDate,
				leagueId: rankPuzzles.leagueId,
				kind: rankPuzzles.kind,
			})
			.from(rankPuzzles)
			.where(
				gte(rankPuzzles.playDate, addArcadeDays(today, -RANK_HISTORY_DAYS)),
			),
		activeLeagues(),
		usedRankSignatures(),
	])
	const plan = planRankSlots(
		today,
		scheduled,
		all.map((l) => l.id),
	)
	const poolCache = new Map<string, Pools>()
	let filled = 0
	for (const slot of plan) {
		const built = await buildRankPuzzleFor(
			slot.leagueId,
			slot.kinds,
			used,
			poolCache,
		)
		if (!built) continue
		used.add(built.puzzle.signature)
		const inserted = await db
			.insert(rankPuzzles)
			.values({ ...built.puzzle, leagueId: built.leagueId, playDate: slot.day })
			.onConflictDoNothing()
			.returning({ id: rankPuzzles.id })
		filled += inserted.length
	}
	return { scheduled: filled }
}

runCli(
	import.meta.url,
	async () => {
		const { scheduled } = await fillRankSchedule()
		console.log(`Scheduled ${scheduled} Blind Rank puzzles.`)
	},
	{ lock: FILL_RANK_SCHEDULE_LOCK },
)
