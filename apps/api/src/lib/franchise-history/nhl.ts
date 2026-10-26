import { nhlFranchiseTeam } from "./franchise-map"
import { fetchJson } from "./http"
import {
	HALL_OF_FAME_BONUS,
	type HistoryPlayer,
	type HistoryStint,
	type Log,
} from "./types"

// The NHL's all-time pools, from records.nhl.com: career totals per player
// per franchise, skaters and goalies separately, keyed by the NHL's own
// player id (the one its mugshot CDN uses). The same API flags Hall of
// Famers and the league's 100 Greatest Players.

const RECORDS = "https://records.nhl.com/site/api"

export type NhlCareerRow = {
	playerId: number
	firstName: string
	lastName: string
	franchiseId: number
	teamAbbrevs: string
	// Season ids like 19791980.
	firstSeasonForGameType: number
	lastSeasonForGameType: number
	seasonsPlayed: number
	gamesPlayed: number
	activePlayer: boolean
	positionCode?: string
	// Skaters.
	points?: number
	// Goalies.
	wins?: number | null
}

// 19791980 -> 1980, the season-end year.
export const seasonEndYear = (seasonId: number) => seasonId % 10_000

// Half a point per game, a point per point (or two per goalie win, so a
// franchise goalie lands among its great skaters), and flat bonuses for
// the Hall of Fame and the 100 Greatest.
export function nhlScore(
	row: NhlCareerRow,
	flags: { hallOfFame: boolean; top100: boolean },
): number {
	return (
		row.gamesPlayed / 2 +
		(row.points ?? 0) +
		(row.wins ?? 0) * 2 +
		(flags.hallOfFame ? HALL_OF_FAME_BONUS.nhl : 0) +
		(flags.top100 ? 300 : 0)
	)
}

type Flags = { hallOfFame: Set<number>; top100: Set<number> }

type NhlPlayerStints = {
	row: NhlCareerRow
	active: boolean
	stints: HistoryStint[]
}

// A player with both a skater and a goalie row for one franchise (a handful
// from the 1920s) gets them added together.
export function nhlStints(
	rows: NhlCareerRow[],
	flags: Flags,
): Map<number, NhlPlayerStints> {
	const out = new Map<number, NhlPlayerStints>()
	for (const row of rows) {
		const team = nhlFranchiseTeam(row.franchiseId, row.teamAbbrevs)
		if (!team) continue
		const hallOfFame = flags.hallOfFame.has(row.playerId)
		const stint: HistoryStint = {
			teamAbbreviation: team,
			firstSeason: seasonEndYear(row.firstSeasonForGameType),
			lastSeason: seasonEndYear(row.lastSeasonForGameType),
			seasons: row.seasonsPlayed,
			games: row.gamesPlayed,
			score: nhlScore(row, {
				hallOfFame,
				top100: flags.top100.has(row.playerId),
			}),
			hallOfFame,
		}
		const entry = out.get(row.playerId) ?? { row, active: false, stints: [] }
		entry.active ||= row.activePlayer
		entry.stints.push(stint)
		out.set(row.playerId, entry)
	}
	return out
}

async function playerIds(cayenneExp: string): Promise<Set<number>> {
	const json = await fetchJson<{ data: { id: number }[] }>(
		`${RECORDS}/player?cayenneExp=${encodeURIComponent(cayenneExp)}&limit=-1`,
	)
	return new Set(json.data.map((player) => player.id))
}

export const nhlHeadshotUrl = (playerId: string) =>
	`https://assets.nhle.com/mugs/nhl/latest/${playerId}.png`

export async function loadNhlHistory(log: Log): Promise<HistoryPlayer[]> {
	const franchises = await fetchJson<{ data: { id: number }[] }>(
		`${RECORDS}/franchise`,
	)
	const rows: NhlCareerRow[] = []
	for (const { id } of franchises.data) {
		const skaters = await fetchJson<{ data: NhlCareerRow[] }>(
			`${RECORDS}/skater-career-scoring-regular-season?cayenneExp=${encodeURIComponent(`franchiseId=${id}`)}&limit=-1`,
		)
		const goalies = await fetchJson<{ data: NhlCareerRow[] }>(
			`${RECORDS}/goalie-career-stats?cayenneExp=${encodeURIComponent(`franchiseId=${id} and gameTypeId=2`)}&limit=-1`,
		)
		rows.push(
			...skaters.data,
			...goalies.data.map((row) => ({ ...row, positionCode: "G" })),
		)
		log(
			`nhl: franchise ${id} ${skaters.data.length} skaters, ${goalies.data.length} goalies`,
		)
	}
	const flags = {
		hallOfFame: await playerIds("inHockeyHof=1"),
		top100: await playerIds("inTop100Alltime=1"),
	}
	log(
		`nhl: ${flags.hallOfFame.size} Hall of Famers, ${flags.top100.size} of the 100 Greatest`,
	)

	return [...nhlStints(rows, flags)].map(
		([playerId, { row, active, stints }]) => ({
			sourceId: String(playerId),
			name: `${row.firstName} ${row.lastName}`,
			position: row.positionCode ?? null,
			espnId: null,
			imageId: String(playerId),
			headshotUrl: nhlHeadshotUrl(String(playerId)),
			active,
			stints,
		}),
	)
}
