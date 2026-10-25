import { NBA_FRANCHISES } from "./franchise-map"
import { fetchText } from "./http"
import type { HistoryPlayer, HistoryStint, Log } from "./types"
import { sparql } from "./wikidata"

// The NBA's all-time pools, from Basketball-Reference: each franchise's
// /teams/{code}/players.html lists everyone who played for it with their
// totals there, keyed by bref's player id, and /awards/hof.html marks the
// Hall of Famers. Wikidata crosswalks bref ids to ESPN's and NBA.com's.

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
		(hallOfFame ? 1_500 : 0)
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
		}
	})
}
