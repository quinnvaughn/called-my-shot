import { and, eq, inArray, lt } from "drizzle-orm"
import { db } from "../../db"
import {
	playerCareers,
	playerSeasonLeaders,
	teamSeasons,
} from "../../db/schema"
import {
	defaultEspnClient,
	type EspnAthleteCareer,
	type EspnClient,
	type EspnCoreAthlete,
} from "../../db/sync/espn-client"
import {
	createEspnRequester,
	DEFAULT_ESPN_SPACING_MS,
	type EspnRequester,
} from "../../db/sync/espn-requester"
import { SYNCED_LEAGUES, type SyncLeagueConfig } from "../../db/sync/leagues"
import {
	ARCHIVE_FIRST_YEAR,
	ArchiveIncompleteError,
	lastFinishedYear,
	read,
} from "../season-puzzles/archive"
import {
	isSeasonLeague,
	type SeasonLeague,
} from "../season-puzzles/archive-parse"
import { DAY_MS } from "../time"
import { PLAYER_RANK_STATS } from "./rank-stats"

// Blind Rank's player pools: each season's top players in the stats it ranks
// (player_season_leaders), and career totals for the players who led
// (player_careers). Read from ESPN once and kept.

// How deep each season leaderboard goes. Deep enough for a real spread of
// values, shallow enough that the names are ones people know.
export const LEADERS_DEPTH = 30
// A player is in the career pool once they've been this high in some stat in
// some season.
export const CAREER_POOL_RANK = 20
// A player still adding to their totals is read again at most this often.
const CAREER_REFRESH_DAYS = 7

const athleteIdOf = (ref: string) => ref.match(/athletes\/(\d+)/)?.[1] ?? null

// The team each player led in some stat in one season, by name, from the
// Name That Season archive. ESPN's own record of a player's season names
// their team today rather than then for a player who moved (John Tavares's
// 2010-11 reads Toronto), so a player's team is only one they're confirmed
// to have led. Anyone else goes without a team rather than a wrong one.
async function leaderTeams(leagueId: string, year?: number) {
	const rows = await db
		.select({
			teamId: teamSeasons.teamId,
			name: teamSeasons.name,
			year: teamSeasons.year,
			leaders: teamSeasons.leaders,
		})
		.from(teamSeasons)
		.where(
			year === undefined
				? eq(teamSeasons.leagueId, leagueId)
				: and(eq(teamSeasons.leagueId, leagueId), eq(teamSeasons.year, year)),
		)
	const byName = new Map<string, { teamId: string; name: string }>()
	for (const row of rows) {
		for (const leader of row.leaders) {
			const key =
				year === undefined ? `${row.year}:${leader.athlete}` : leader.athlete
			byName.set(key, { teamId: row.teamId, name: row.name })
		}
	}
	return byName
}

// Re-reads every archived leader's team from the archive's team leaders,
// and each career's team from those, so both stay right as the Name That
// Season archive fills in. Database only.
export async function assignLeaderTeams(leagueId: string) {
	const teamOf = await leaderTeams(leagueId)
	const rows = await db
		.select()
		.from(playerSeasonLeaders)
		.where(eq(playerSeasonLeaders.leagueId, leagueId))
	const careerTeams = new Map<string, Map<string, number>>()
	await db.transaction(async (tx) => {
		for (const row of rows) {
			const team = teamOf.get(`${row.year}:${row.athlete}`)
			const teamId = team?.teamId ?? null
			if (teamId) {
				const counts = careerTeams.get(row.espnAthleteId) ?? new Map()
				counts.set(teamId, (counts.get(teamId) ?? 0) + 1)
				careerTeams.set(row.espnAthleteId, counts)
			}
			if (row.teamId === teamId && row.teamName === (team?.name ?? null)) {
				continue
			}
			await tx
				.update(playerSeasonLeaders)
				.set({ teamId, teamName: team?.name ?? null })
				.where(eq(playerSeasonLeaders.id, row.id))
		}
		const careers = await tx
			.select({
				id: playerCareers.id,
				espnAthleteId: playerCareers.espnAthleteId,
				teamId: playerCareers.teamId,
			})
			.from(playerCareers)
			.where(eq(playerCareers.leagueId, leagueId))
		for (const career of careers) {
			const counts = careerTeams.get(career.espnAthleteId)
			const teamId = counts
				? ([...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null)
				: null
			if (career.teamId === teamId) continue
			await tx
				.update(playerCareers)
				.set({ teamId })
				.where(eq(playerCareers.id, career.id))
		}
	})
}

// One league-year's leaders, read from ESPN. Nothing when ESPN has nothing
// for the year: its stand-in is a later season, which the athletes' season
// $refs give away. Throws ArchiveIncompleteError when a read fails.
async function readLeagueYearLeaders(
	config: SyncLeagueConfig,
	league: SeasonLeague,
	leagueId: string,
	year: number,
	espn: EspnClient,
	requester: EspnRequester,
) {
	const data = await read(requester, `${league} ${year} leaders`, () =>
		espn.fetchSeasonLeaders(config.espnPath, year, LEADERS_DEPTH),
	)
	if (!data) return []
	const wanted = new Set(PLAYER_RANK_STATS[league].map((s) => s.category))
	const entries = data.categories
		.filter((c) => wanted.has(c.name))
		.flatMap((c) =>
			c.leaders.flatMap((leader, rank) => {
				const ref = leader.athlete?.$ref
				const espnAthleteId = ref ? athleteIdOf(ref) : null
				return ref && espnAthleteId
					? [
							{
								category: c.name,
								rank,
								ref,
								espnAthleteId,
								value: leader.value,
							},
						]
					: []
			}),
		)
	if (entries.length === 0) return []
	if (entries.some((e) => !e.ref.includes(`/seasons/${year}/`))) return []

	const teamOf = await leaderTeams(leagueId, year)

	const athletes = new Map<string, EspnCoreAthlete | null>()
	for (const entry of entries) {
		if (athletes.has(entry.espnAthleteId)) continue
		athletes.set(
			entry.espnAthleteId,
			await read(requester, `athlete ${entry.espnAthleteId}`, () =>
				espn.fetchCoreAthlete(entry.ref),
			),
		)
	}

	return entries.flatMap((entry) => {
		const athlete = athletes.get(entry.espnAthleteId)
		if (!athlete) return []
		const team = teamOf.get(athlete.displayName)
		return [
			{
				leagueId,
				year,
				category: entry.category,
				rank: entry.rank,
				espnAthleteId: entry.espnAthleteId,
				athlete: athlete.displayName,
				teamId: team?.teamId ?? null,
				teamName: team?.name ?? null,
				value: entry.value,
			},
		]
	})
}

async function archivedLeaderYears(leagueId: string): Promise<Set<number>> {
	const rows = await db
		.selectDistinct({ year: playerSeasonLeaders.year })
		.from(playerSeasonLeaders)
		.where(eq(playerSeasonLeaders.leagueId, leagueId))
	return new Set(rows.map((r) => r.year))
}

// Whatever a player's career totals are in the stats their league ranks.
export function careerStatsFrom(
	league: SeasonLeague,
	career: EspnAthleteCareer | null,
): Record<string, number> {
	const stats: Record<string, number> = {}
	for (const { careerKey } of PLAYER_RANK_STATS[league]) {
		const [group, name] = careerKey.split(".")
		const value = career?.splits?.categories
			.find((c) => c.name === group)
			?.stats.find((s) => s.name === name)?.value
		if (typeof value === "number") stats[careerKey] = value
	}
	return stats
}

// Fetches career totals for every player in a league's career pool who has
// none yet, and again for anyone who led in a season since `refreshSince`
// (still adding to them) once theirs are a week old.
async function archiveCareers(
	config: SyncLeagueConfig,
	league: SeasonLeague,
	leagueId: string,
	refreshSince: number,
	espn: EspnClient,
	requester: EspnRequester,
): Promise<number> {
	const leaders = await db
		.select({
			espnAthleteId: playerSeasonLeaders.espnAthleteId,
			athlete: playerSeasonLeaders.athlete,
			teamId: playerSeasonLeaders.teamId,
			year: playerSeasonLeaders.year,
		})
		.from(playerSeasonLeaders)
		.where(
			and(
				eq(playerSeasonLeaders.leagueId, leagueId),
				lt(playerSeasonLeaders.rank, CAREER_POOL_RANK),
			),
		)
	const byAthlete = new Map<
		string,
		{ athlete: string; latest: number; teams: Map<string, number> }
	>()
	for (const row of leaders) {
		const entry = byAthlete.get(row.espnAthleteId) ?? {
			athlete: row.athlete,
			latest: row.year,
			teams: new Map<string, number>(),
		}
		if (row.year >= entry.latest) {
			entry.latest = row.year
			entry.athlete = row.athlete
		}
		if (row.teamId) {
			entry.teams.set(row.teamId, (entry.teams.get(row.teamId) ?? 0) + 1)
		}
		byAthlete.set(row.espnAthleteId, entry)
	}
	const ids = [...byAthlete.keys()]
	const fetchedAt = new Map(
		ids.length === 0
			? []
			: (
					await db
						.select({
							id: playerCareers.espnAthleteId,
							fetchedAt: playerCareers.fetchedAt,
						})
						.from(playerCareers)
						.where(
							and(
								eq(playerCareers.leagueId, leagueId),
								inArray(playerCareers.espnAthleteId, ids),
							),
						)
				).map((r) => [r.id, r.fetchedAt]),
	)
	const staleBefore = new Date(Date.now() - CAREER_REFRESH_DAYS * DAY_MS)

	let written = 0
	for (const [espnAthleteId, entry] of byAthlete) {
		const fetched = fetchedAt.get(espnAthleteId)
		const refresh =
			entry.latest >= refreshSince && fetched && fetched < staleBefore
		if (fetched && !refresh) continue
		const career = await read(requester, `career ${espnAthleteId}`, () =>
			espn.fetchAthleteCareer(config.espnPath, espnAthleteId),
		)
		const stats = careerStatsFrom(league, career)
		if (Object.keys(stats).length === 0) continue
		const teamId =
			[...entry.teams.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
		const values = {
			leagueId,
			espnAthleteId,
			athlete: entry.athlete,
			teamId,
			stats,
			fetchedAt: new Date(),
		}
		await db
			.insert(playerCareers)
			.values(values)
			.onConflictDoUpdate({
				target: [playerCareers.leagueId, playerCareers.espnAthleteId],
				set: values,
			})
		written++
	}
	return written
}

export type RankArchiveOptions = {
	leagues?: SeasonLeague[]
	from?: number
	to?: number
	// Career totals are re-read for players who led in a season this recent.
	refreshCareersSince?: number
	spacingMs?: number
	espn?: EspnClient
	log?: (line: string) => void
}

// Archives every finished season's leaders not archived yet, then the
// careers of the players who led. Safe to interrupt: a season is skipped once
// it has rows, and a career once it's been read.
export async function archiveRankData({
	leagues,
	from = ARCHIVE_FIRST_YEAR,
	to,
	refreshCareersSince,
	spacingMs = DEFAULT_ESPN_SPACING_MS,
	espn = defaultEspnClient,
	log = () => {},
}: RankArchiveOptions = {}) {
	const requester = createEspnRequester("archive-rank", spacingMs)
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
	let careers = 0
	for (const config of configs) {
		const league = config.leagueSlug
		const row = rows.find((l) => l.slug === league)
		if (!row || !isSeasonLeague(league)) continue
		const last = Math.min(
			to ?? Number.POSITIVE_INFINITY,
			await lastFinishedYear(row.id),
		)
		const done = await archivedLeaderYears(row.id)
		for (let year = from; year <= last; year++) {
			if (done.has(year)) continue
			try {
				const leaders = await readLeagueYearLeaders(
					config,
					league,
					row.id,
					year,
					espn,
					requester,
				)
				await db.transaction(async (tx) => {
					for (const value of leaders) {
						await tx
							.insert(playerSeasonLeaders)
							.values(value)
							.onConflictDoUpdate({
								target: [
									playerSeasonLeaders.leagueId,
									playerSeasonLeaders.year,
									playerSeasonLeaders.category,
									playerSeasonLeaders.espnAthleteId,
								],
								set: value,
							})
					}
				})
				log(`${league} ${year}: ${leaders.length} leaders`)
				if (leaders.length > 0) seasons++
			} catch (err) {
				if (!(err instanceof ArchiveIncompleteError)) throw err
				log(`${league} ${year}: skipped, ESPN failed ${err.message}`)
			}
		}
		await assignLeaderTeams(row.id)
		try {
			const count = await archiveCareers(
				config,
				league,
				row.id,
				refreshCareersSince ?? Number.POSITIVE_INFINITY,
				espn,
				requester,
			)
			log(`${league} careers: ${count}`)
			careers += count
		} catch (err) {
			if (!(err instanceof ArchiveIncompleteError)) throw err
			log(`${league} careers: stopped, ESPN failed ${err.message}`)
		}
	}
	return { seasons, careers }
}

// The daily upkeep: a league's newest finished season once it's over, and
// fresh career totals for the players who led in it.
export function archiveFinishedRankData() {
	const recent = new Date().getUTCFullYear() - 2
	return archiveRankData({ from: recent, refreshCareersSince: recent })
}
