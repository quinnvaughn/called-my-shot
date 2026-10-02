import {
	hasOtLosses,
	type ParsedTeamRecord,
	parseTeamRecord,
} from "../../lib/team-record"
import { db } from "../index"
import { type Season, teamSeasonStats } from "../schema"
import {
	defaultEspnClient,
	type EspnClient,
	type EspnStandingsEntry,
} from "./espn-client"
import { createEspnRequester, DEFAULT_ESPN_SPACING_MS } from "./espn-requester"
import type { SyncLeagueConfig } from "./leagues"
import { parseStandingsEntries } from "./season-stats-parse"
import { loadEspnIds } from "./sync-refs"

const JOB = "sync-team-season-stats"

// Basketball is the only synced league with a possession count, and the only
// one whose scoring figure is a rate rather than a total - see the metric map
// in lib/stat-context/differential.ts. Getting it costs one request per team,
// so it is asked for only where it is used.
const NEEDS_POSSESSIONS = new Set(["nba"])

// Where ESPN keeps the possession count on a team's season statistics. Their
// own count, not the estimate alongside it: estimatedPossessions is a formula
// over box-score columns, and a net rating built on it is a different number
// from the one ESPN publishes.
const POSSESSIONS_KEY = "offensive.possessions"

function statValue(entry: EspnStandingsEntry, name: string): number | null {
	const value = entry.stats.find((stat) => stat.name === name)?.value
	return value !== undefined && Number.isFinite(value) ? value : null
}

function statText(entry: EspnStandingsEntry, name: string): string | null {
	return entry.stats.find((stat) => stat.name === name)?.displayValue ?? null
}

// "31-9", "12-4-1" or the NHL's "29-10-2" -> its counts. A split ESPN has no
// games for yet comes back as "-" or empty, which reads as all zeroes rather
// than throwing.
function parseSplit(
	display: string | null,
	leagueSlug: string,
): ParsedTeamRecord {
	return (
		parseTeamRecord(display, leagueSlug) ?? {
			wins: 0,
			losses: 0,
			ties: 0,
			otLosses: hasOtLosses(leagueSlug) ? 0 : null,
		}
	)
}

// The day this reading belongs to. Standings are a moving snapshot and the
// cards that read them need "what was known before kickoff", so each run
// stamps a date and a re-run the same day overwrites rather than appends.
function startOfDay(now: Date): Date {
	return new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
	)
}

// Today's standings row for every team in one league, stored as a dated
// snapshot. Nothing here is recomputed from this app's own games: ESPN's
// pointDifferential, splits and streak are taken as given, the same call
// teamRecords makes.
export async function syncTeamSeasonStats(
	config: SyncLeagueConfig,
	league: { id: string; slug: string },
	season: Season,
	{
		now = new Date(),
		espn = defaultEspnClient,
		spacingMs = DEFAULT_ESPN_SPACING_MS,
	}: { now?: Date; espn?: EspnClient; spacingMs?: number } = {},
): Promise<void> {
	const requester = createEspnRequester(JOB, spacingMs)

	const standings = await requester.request(
		`${league.slug} standings ${season.year}`,
		() =>
			espn.fetchStandings(config.espnPath, season.year, {
				leagueWide: config.seedsLeagueWide,
			}),
	)
	if (!standings) return

	const entries = parseStandingsEntries(standings)
	if (entries.size === 0) return

	const leagueTeams = await db.query.teams.findMany({
		where: { leagueId: league.id },
		columns: { id: true },
	})
	const espnIdByTeamId = await loadEspnIds(
		"team",
		leagueTeams.map((team) => team.id),
	)
	const teamIdByEspnId = new Map(
		[...espnIdByTeamId].map(([teamId, espnId]) => [espnId, teamId]),
	)

	const asOf = startOfDay(now)
	const wantsPossessions = NEEDS_POSSESSIONS.has(league.slug)

	for (const [espnTeamId, entry] of entries) {
		const teamId = teamIdByEspnId.get(espnTeamId)
		// A team in ESPN's standings this app has never synced. Skipped rather
		// than inserted: teams are syncTeams' to create, and a row here with no
		// team to hang off would fail its foreign key anyway.
		if (!teamId) continue

		let possessions: number | null = null
		if (wantsPossessions) {
			const stats = await requester.request(
				`${league.slug} team ${espnTeamId} statistics ${season.year}`,
				() =>
					espn.fetchTeamSeasonStatistics(
						config.espnPath,
						season.year,
						espnTeamId,
					),
			)
			if (stats) possessions = flattenPossessions(stats)
		}

		const home = parseSplit(statText(entry, "Home"), league.slug)
		const road = parseSplit(statText(entry, "Road"), league.slug)

		// Only baseball's standings carry gamesPlayed; football's and
		// basketball's leave it out entirely, which stored a flat 0 and had the
		// card claiming a differential over no games. The record always adds up
		// to the same number, so it stands in wherever ESPN omits it.
		const played =
			statValue(entry, "gamesPlayed") ??
			(statValue(entry, "wins") ?? 0) +
				(statValue(entry, "losses") ?? 0) +
				(statValue(entry, "ties") ?? 0)

		const row = {
			teamId,
			seasonId: season.id,
			asOf,
			gamesPlayed: played,
			pointsFor: statValue(entry, "pointsFor") ?? 0,
			pointsAgainst: statValue(entry, "pointsAgainst") ?? 0,
			pointDifferential: statValue(entry, "pointDifferential") ?? 0,
			homeWins: home.wins,
			homeLosses: home.losses,
			homeTies: home.ties,
			homeOtLosses: home.otLosses,
			roadWins: road.wins,
			roadLosses: road.losses,
			roadTies: road.ties,
			roadOtLosses: road.otLosses,
			streak: statText(entry, "streak"),
			lastTen: statText(entry, "Last Ten Games"),
			possessions,
			playoffSeed: statValue(entry, "playoffSeed"),
			updatedAt: now,
		}

		await db
			.insert(teamSeasonStats)
			.values(row)
			.onConflictDoUpdate({
				target: [
					teamSeasonStats.teamId,
					teamSeasonStats.seasonId,
					teamSeasonStats.asOf,
				],
				set: row,
			})
	}

	console.log(
		`[${JOB}] ${league.slug} ${season.year}: ${entries.size} teams, ${requester.count()} requests`,
	)
}

// ESPN's own possession total, or null when this league's statistics payload
// has no such column.
function flattenPossessions(stats: {
	splits: {
		categories: { name: string; stats: { name: string; value: number }[] }[]
	}
}): number | null {
	for (const category of stats.splits.categories) {
		for (const stat of category.stats) {
			if (`${category.name}.${stat.name}` === POSSESSIONS_KEY) {
				return Number.isFinite(stat.value) ? stat.value : null
			}
		}
	}
	return null
}
