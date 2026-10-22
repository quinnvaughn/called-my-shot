import { eq } from "drizzle-orm"
import { db } from "../../db"
import { type TeamSeasonLeader, teamSeasons } from "../../db/schema"
import { defaultEspnClient, type EspnClient } from "../../db/sync/espn-client"
import {
	createEspnRequester,
	DEFAULT_ESPN_SPACING_MS,
	type EspnRequester,
} from "../../db/sync/espn-requester"
import { SYNCED_LEAGUES, type SyncLeagueConfig } from "../../db/sync/leagues"
import { byEspnId, loadEspnIds } from "../../db/sync/sync-refs"
import {
	isSeasonLeague,
	type LeaderRef,
	leaderRefs,
	leadersLookComplete,
	parseArchiveStandings,
	postseasonOutcomes,
	type SeasonLeague,
	seasonLabel,
} from "./archive-parse"

// Name That Season's answer pool: every franchise's finished seasons, read
// from ESPN once and kept. The first season archived.
export const ARCHIVE_FIRST_YEAR = 1985

// The latest season of a league that's over, postseason included. Seasons
// before the earliest one this app has synced are all over.
export async function lastFinishedYear(
	leagueId: string,
	now = new Date(),
): Promise<number> {
	const seasons = await db.query.seasons.findMany({
		where: { leagueId },
		columns: { year: true, postseasonEndsAt: true },
	})
	const finished = seasons
		.filter((s) => s.postseasonEndsAt && s.postseasonEndsAt < now)
		.map((s) => s.year)
	if (finished.length > 0) return Math.max(...finished)
	if (seasons.length > 0) return Math.min(...seasons.map((s) => s.year)) - 1
	return now.getUTCFullYear() - 1
}

// ESPN failing a request mid-season. The season is left unwritten, so the
// next run reads it again from the start instead of keeping a team with a
// missing leader or a postseason it seemed to miss.
export class ArchiveIncompleteError extends Error {}

// A transient ESPN failure (a 502 or 503) is common on long runs, so each
// read gets a few tries before the season is given up on.
const ATTEMPTS = 3

async function read<T>(
	requester: EspnRequester,
	label: string,
	fetcher: () => Promise<T>,
): Promise<T> {
	for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
		const result = await requester.request(label, async () => ({
			value: await fetcher(),
		}))
		if (result) return result.value
	}
	throw new ArchiveIncompleteError(label)
}

// Athlete names by ESPN athlete id, shared across one run so a player who
// leads his team for a decade is looked up once.
type AthleteNames = Map<string, string | null>

async function athleteName(
	ref: string,
	names: AthleteNames,
	espn: EspnClient,
	requester: EspnRequester,
): Promise<string | null> {
	const id = ref.match(/athletes\/(\d+)/)?.[1] ?? ref
	if (names.has(id)) return names.get(id) ?? null
	const athlete = await read(requester, `athlete ${id}`, () =>
		espn.fetchCoreAthlete(ref),
	)
	const name = athlete?.displayName ?? null
	names.set(id, name)
	return name
}

// How far ESPN's postseason schedule year sat from the season's own last
// time, by league, so the next season asks for the right one first.
type PostseasonOffsets = Map<string, number>

// Archives one league's season: every team in its standings that maps to a
// franchise this app has, with its leaders and how its postseason ended.
// Rerunning a season rewrites its rows. Returns how many were written; throws
// ArchiveIncompleteError, writing nothing, when ESPN fails a read.
export async function archiveLeagueSeason(
	config: SyncLeagueConfig,
	leagueId: string,
	year: number,
	{
		espn = defaultEspnClient,
		requester,
		names = new Map(),
		offsets = new Map(),
	}: {
		espn?: EspnClient
		requester: EspnRequester
		names?: AthleteNames
		offsets?: PostseasonOffsets
	},
): Promise<number> {
	const league = config.leagueSlug
	if (!isSeasonLeague(league)) return 0
	const standings = await read(requester, `${league} ${year} standings`, () =>
		espn.fetchStandings(config.espnPath, year, { divisions: true }),
	)
	const rows = parseArchiveStandings(standings, league, year)
	if (rows.length === 0) return 0

	const leagueTeams = await db.query.teams.findMany({
		where: { leagueId },
		columns: { id: true },
	})
	const teamByEspnId = byEspnId(
		await loadEspnIds(
			"team",
			leagueTeams.map((t) => t.id),
		),
	)

	const teams = rows.filter((row) => teamByEspnId.has(row.espnTeamId))
	const leadersByTeam = new Map<string, LeaderRef[]>()
	for (const row of teams) {
		const leaders = await read(
			requester,
			`${league} ${year} leaders ${row.espnTeamId}`,
			() => espn.fetchTeamLeaders(config.espnPath, year, row.espnTeamId),
		)
		leadersByTeam.set(row.espnTeamId, leaderRefs(leaders, league))
	}

	// Every team's postseason, asked for by the year the last season needed
	// (offsets carries it), then again by the corrected year if what ESPN
	// served says it was off.
	const postseasonFor = async (asked: number) => {
		const all = []
		for (const row of teams) {
			all.push(
				await read(
					requester,
					`${league} ${year} postseason ${row.espnTeamId}`,
					() =>
						espn.fetchTeamPostseason(config.espnPath, asked, row.espnTeamId),
				),
			)
		}
		return all
	}
	let asked = year - (offsets.get(league) ?? 0)
	let schedules = await postseasonFor(asked)
	const served = schedules.find((s) => s.served !== null)?.served ?? null
	if (served !== null && served !== year) {
		asked += year - served
		schedules = await postseasonFor(asked)
		const again = schedules.find((s) => s.served !== null)?.served ?? null
		if (again !== null && again !== year) {
			throw new ArchiveIncompleteError(`${league} ${year} postseason year`)
		}
	}
	offsets.set(league, year - asked)
	const postseason = schedules.flatMap((s) => s.events)
	const outcomes = postseasonOutcomes(postseason)
	// A season with no postseason at all (MLB's 1994) can't have a true
	// "how it ended" clue.
	const hadPostseason = outcomes.size > 0

	const values: (typeof teamSeasons.$inferInsert)[] = []
	for (const row of rows) {
		const teamId = teamByEspnId.get(row.espnTeamId)
		if (!teamId) continue
		const leaders: TeamSeasonLeader[] = []
		for (const ref of leadersByTeam.get(row.espnTeamId) ?? []) {
			const athlete = await athleteName(ref.athleteRef, names, espn, requester)
			if (athlete) {
				leaders.push({ category: ref.category, athlete, line: ref.line })
			}
		}
		const outcome = outcomes.get(row.espnTeamId)
		values.push({
			leagueId,
			teamId,
			year,
			label: seasonLabel(league, year),
			name: row.name,
			wins: row.wins,
			losses: row.losses,
			ties: row.ties,
			otLosses: row.otLosses,
			pointsFor: row.pointsFor,
			pointsAgainst: row.pointsAgainst,
			conference: row.conference,
			division: row.division,
			divisionRank: row.divisionRank,
			outcome: outcome?.outcome ?? ("missed" as const),
			roundsFromFinal: outcome?.roundsFromFinal ?? null,
			leaders,
			puzzleReady: hadPostseason && leadersLookComplete(league, leaders),
		})
	}
	await db.transaction(async (tx) => {
		for (const value of values) {
			await tx
				.insert(teamSeasons)
				.values(value)
				.onConflictDoUpdate({
					target: [teamSeasons.teamId, teamSeasons.year],
					set: value,
				})
		}
	})
	return values.length
}

async function archivedYears(leagueId: string): Promise<Set<number>> {
	const rows = await db
		.selectDistinct({ year: teamSeasons.year })
		.from(teamSeasons)
		.where(eq(teamSeasons.leagueId, leagueId))
	return new Set(rows.map((r) => r.year))
}

export type ArchiveOptions = {
	leagues?: SeasonLeague[]
	from?: number
	to?: number
	// Rewrites seasons already archived instead of skipping them.
	refresh?: boolean
	spacingMs?: number
	espn?: EspnClient
	log?: (line: string) => void
}

// Archives every finished season from `from` (ARCHIVE_FIRST_YEAR by default)
// that isn't archived yet. Safe to interrupt: a season is skipped once it has
// rows, so a rerun picks up where the last one stopped.
export async function archiveSeasons({
	leagues,
	from = ARCHIVE_FIRST_YEAR,
	to,
	refresh = false,
	spacingMs = DEFAULT_ESPN_SPACING_MS,
	espn = defaultEspnClient,
	log = () => {},
}: ArchiveOptions = {}): Promise<{ seasons: number; teamSeasons: number }> {
	const requester = createEspnRequester("archive-seasons", spacingMs)
	const names: AthleteNames = new Map()
	const offsets: PostseasonOffsets = new Map()
	const configs = SYNCED_LEAGUES.filter(
		(c) =>
			isSeasonLeague(c.leagueSlug) &&
			(!leagues || leagues.includes(c.leagueSlug)),
	)
	const rows = await db.query.leagues.findMany({
		where: {
			slug: { in: configs.map((c) => c.leagueSlug) },
			status: "active",
		},
		columns: { id: true, slug: true },
	})
	let seasons = 0
	let written = 0
	for (const config of configs) {
		const league = rows.find((l) => l.slug === config.leagueSlug)
		if (!league) continue
		const last = Math.min(
			to ?? Number.POSITIVE_INFINITY,
			await lastFinishedYear(league.id),
		)
		const done = refresh ? new Set<number>() : await archivedYears(league.id)
		for (let year = from; year <= last; year++) {
			if (done.has(year)) continue
			let count = 0
			try {
				count = await archiveLeagueSeason(config, league.id, year, {
					espn,
					requester,
					names,
					offsets,
				})
			} catch (err) {
				if (!(err instanceof ArchiveIncompleteError)) throw err
				log(`${config.leagueSlug} ${year}: skipped, ESPN failed ${err.message}`)
				continue
			}
			log(`${config.leagueSlug} ${year}: ${count} team-seasons`)
			if (count > 0) seasons++
			written += count
		}
	}
	return { seasons, teamSeasons: written }
}

// The daily upkeep: each league's newest finished season, once it's over.
// Most days every league already has it and this reads nothing.
export function archiveFinishedSeasons() {
	return archiveSeasons({ from: new Date().getUTCFullYear() - 2 })
}
