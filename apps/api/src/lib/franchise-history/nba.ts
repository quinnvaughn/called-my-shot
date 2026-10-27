import { NBA_FRANCHISES } from "./franchise-map"
import { fetchText } from "./http"
import {
	HALL_OF_FAME_BONUS,
	type HistoryPlayer,
	type HistoryStint,
	type HistoryTeamSeason,
	type Log,
} from "./types"
import { sparql } from "./wikidata"

// The NBA's all-time pools, from Basketball-Reference: each franchise's
// /teams/{code}/players.html lists everyone who played for it with their
// totals there, keyed by bref's player id, and /awards/hof.html marks the
// Hall of Famers. Wikidata crosswalks bref ids to ESPN's and NBA.com's. The
// exact seasons behind each stint come from every season's player totals.

const BREF = "https://www.basketball-reference.com"

export type BrefFranchiseRow = {
	brefId: string
	name: string
	from: number
	to: number
	years: number
	games: number
	points: number
	rebounds: number
	assists: number
}

const ENTITIES: Record<string, string> = {
	"&amp;": "&",
	"&#39;": "'",
	"&#x27;": "'",
	"&quot;": '"',
	"&nbsp;": " ",
}

export function decodeEntities(text: string): string {
	return text
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&[#\w]+;/g, (entity) => ENTITIES[entity] ?? entity)
}

// The text of each data-stat cell in one table row.
function cells(row: string): Map<string, string> {
	const out = new Map<string, string>()
	for (const cell of row.matchAll(
		/<t[dh][^>]*data-stat="([^"]+)"[^>]*>(.*?)<\/t[dh]>/g,
	)) {
		out.set(cell[1] as string, (cell[2] as string).replace(/<[^>]+>/g, ""))
	}
	return out
}

const num = (value: string | undefined) => Number(value ?? "") || 0

// Bref's years (year_min/year_max) are season-end years, the same
// convention as the stints table.
export function parseBrefFranchisePlayers(html: string): BrefFranchiseRow[] {
	const rows: BrefFranchiseRow[] = []
	for (const row of html.split("<tr").slice(1)) {
		const brefId = row.match(
			/data-append-csv="([^"]+)" data-stat="player"/,
		)?.[1]
		if (!brefId) continue
		const stats = cells(row)
		rows.push({
			brefId,
			name: decodeEntities(stats.get("player") ?? "")
				.replace("*", "")
				.trim(),
			from: num(stats.get("year_min")),
			to: num(stats.get("year_max")),
			years: num(stats.get("years")),
			games: num(stats.get("g")),
			points: num(stats.get("pts")),
			rebounds: num(stats.get("trb")),
			assists: num(stats.get("ast")),
		})
	}
	return rows
}

// One season on a franchise's /teams/{code}/ page: the code Basketball-
// Reference keys that season's team by (SEA for the Sonics years on OKC's
// page) and the league it played in (NBA, BAA, ABA).
export type BrefFranchiseSeason = {
	code: string
	season: number
	league: string
}

export function parseBrefFranchiseSeasons(html: string): BrefFranchiseSeason[] {
	const seasons: BrefFranchiseSeason[] = []
	for (const row of html.split("<tr").slice(1)) {
		const team = row.match(
			/data-stat="season"[^>]*><a href="\/teams\/(\w+)\/(\d{4})\.html"/,
		)
		const league = row.match(
			/data-stat="lg_id"[^>]*><a href="\/leagues\/(\w+)_\d{4}\.html"/,
		)?.[1]
		if (!team || !league) continue
		seasons.push({
			code: team[1] as string,
			season: Number(team[2]),
			league,
		})
	}
	return seasons
}

// One row of a season's regular-season player totals: who, and the code of
// the team the row is for. A player traded mid-season has a row per team plus
// a combined one (2TM, 3TM) that links to no team and is skipped. The page's
// playoff table comes after and is left out.
export type BrefSeasonTotalsRow = { brefId: string; code: string }

export function parseBrefSeasonTotals(html: string): BrefSeasonTotalsRow[] {
	const start = html.indexOf('id="totals_stats"')
	if (start < 0) return []
	const table = html.slice(start, html.indexOf("</table>", start))
	const rows: BrefSeasonTotalsRow[] = []
	for (const row of table.split("<tr").slice(1)) {
		const brefId = row.match(
			/data-append-csv="([^"]+)" data-stat="(?:name_display|player)"/,
		)?.[1]
		const code = row.match(
			/data-stat="(?:team_name_abbr|team_id)"[^>]*><a href="\/teams\/(\w+)\/\d{4}\.html"/,
		)?.[1]
		if (brefId && code) rows.push({ brefId, code })
	}
	return rows
}

// Bref ids of everyone inducted as a player. Coaches, referees and
// contributors are listed on the same page, some with a playing career too
// (Bill Russell went in again as a coach), so only the Player rows count.
export function parseBrefHallOfFame(html: string): Set<string> {
	const ids = new Set<string>()
	for (const row of html.split("<tr").slice(1)) {
		if (!/data-stat="category"[^>]*>Player</.test(row)) continue
		const id = row.match(/href="\/players\/\w\/([a-z0-9]+)\.html"/)?.[1]
		if (id) ids.add(id)
	}
	return ids
}

// Games, then a tenth of a point for each point, rebound and assist with the
// franchise, then a flat Hall of Fame bonus worth a long career. Bill Russell
// leads the Celtics on rebounds rather than points, which is why rebounds and
// assists count alongside scoring.
export function nbaScore(row: BrefFranchiseRow, hallOfFame: boolean): number {
	return (
		row.games +
		(row.points + row.rebounds + row.assists) / 10 +
		(hallOfFame ? HALL_OF_FAME_BONUS.nba : 0)
	)
}

type NbaCrosswalk = { espnId: string | null; nbaId: string | null }

// Wikidata keys bref ids as "r/russebi01".
async function loadCrosswalk(): Promise<Map<string, NbaCrosswalk>> {
	const rows = await sparql(`SELECT ?bref ?nba ?espn WHERE {
		?p wdt:P2685 ?bref .
		OPTIONAL { ?p wdt:P3647 ?nba }
		OPTIONAL { ?p wdt:P3685 ?espn }
	}`)
	const out = new Map<string, NbaCrosswalk>()
	for (const row of rows) {
		const brefId = row.bref?.split("/").pop()
		if (!brefId) continue
		const prev = out.get(brefId)
		out.set(brefId, {
			espnId: prev?.espnId ?? row.espn ?? null,
			nbaId: prev?.nbaId ?? row.nba ?? null,
		})
	}
	return out
}

export const nbaHeadshotUrl = (nbaId: string) =>
	`https://cdn.nba.com/headshots/nba/latest/1040x760/${nbaId}.png`

// Bref id -> every NBA (and BAA) season he played, with the franchise. The
// franchise pages say which of today's franchises each season's team code
// belongs to, and each season's totals page says who played for which team.
async function loadNbaTeamSeasons(
	log: Log,
): Promise<Map<string, HistoryTeamSeason[]>> {
	const franchiseOf = new Map<string, string>()
	const seasons = new Map<string, { league: string; season: number }>()
	for (const [code, abbreviation] of Object.entries(NBA_FRANCHISES)) {
		for (const row of parseBrefFranchiseSeasons(
			await fetchText(`${BREF}/teams/${code}/`),
		)) {
			if (row.league !== "NBA" && row.league !== "BAA") continue
			franchiseOf.set(`${row.code}:${row.season}`, abbreviation)
			seasons.set(`${row.league}_${row.season}`, row)
		}
	}
	log(`nba: reading ${seasons.size} seasons of player totals`)

	const out = new Map<string, HistoryTeamSeason[]>()
	for (const [key, { season }] of seasons) {
		const rows = parseBrefSeasonTotals(
			await fetchText(`${BREF}/leagues/${key}_totals.html`),
		)
		for (const row of rows) {
			const team = franchiseOf.get(`${row.code}:${season}`)
			if (!team) continue
			out.set(row.brefId, [
				...(out.get(row.brefId) ?? []),
				{ teamAbbreviation: team, season },
			])
		}
	}
	return out
}

export async function loadNbaHistory(log: Log): Promise<HistoryPlayer[]> {
	const hallOfFame = parseBrefHallOfFame(
		await fetchText(`${BREF}/awards/hof.html`),
	)
	log(`nba: ${hallOfFame.size} Hall of Fame players`)
	const crosswalk = await loadCrosswalk()
	log(`nba: ${crosswalk.size} bref ids in Wikidata`)

	const byPlayer = new Map<string, { name: string; stints: HistoryStint[] }>()
	let latestSeason = 0
	for (const [code, abbreviation] of Object.entries(NBA_FRANCHISES)) {
		const rows = parseBrefFranchisePlayers(
			await fetchText(`${BREF}/teams/${code}/players.html`),
		)
		log(`nba: ${code} ${rows.length} players`)
		for (const row of rows) {
			latestSeason = Math.max(latestSeason, row.to)
			const hof = hallOfFame.has(row.brefId)
			const entry = byPlayer.get(row.brefId) ?? { name: row.name, stints: [] }
			entry.stints.push({
				teamAbbreviation: abbreviation,
				firstSeason: row.from,
				lastSeason: row.to,
				seasons: row.years,
				games: row.games,
				score: nbaScore(row, hof),
				hallOfFame: hof,
			})
			byPlayer.set(row.brefId, entry)
		}
	}

	const teamSeasons = await loadNbaTeamSeasons(log)

	return [...byPlayer].map(([brefId, { name, stints }]) => {
		const ids = crosswalk.get(brefId)
		return {
			sourceId: brefId,
			name,
			position: null,
			espnId: ids?.espnId ?? null,
			imageId: ids?.nbaId ?? null,
			headshotUrl: ids?.nbaId ? nbaHeadshotUrl(ids.nbaId) : null,
			active: stints.some((stint) => stint.lastSeason >= latestSeason - 1),
			stints,
			teamSeasons: teamSeasons.get(brefId) ?? [],
		}
	})
}
