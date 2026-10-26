import { NBA_FRANCHISES } from "../franchise-history/franchise-map"
import { politeFetch } from "../franchise-history/http"
import { decodeEntities } from "../franchise-history/nba"
import type { Log } from "../franchise-history/types"
import type { SourcePick } from "./types"

// The NBA's drafts from Basketball-Reference, one page per year: the BAA's
// three (1947-49) and every NBA draft since. Each pick links the player by
// the bref id the franchise history uses, and the team by its franchise code
// (the 2007 SuperSonics link to OKC), with that year's name as the title.

const BREF = "https://www.basketball-reference.com"
const FIRST_DRAFT = 1947

export const brefDraftUrl = (year: number) =>
	`${BREF}/draft/${year < 1950 ? "BAA" : "NBA"}_${year}.html`

export function parseBrefDraft(html: string, year: number): SourcePick[] {
	const picks: SourcePick[] = []
	let round = 1
	for (const row of html.split("<tr").slice(1)) {
		const header = row.match(/data-stat="header_draft"[^>]*>Round (\d+)</)
		if (header) {
			round = Number(header[1])
			continue
		}
		const overall = row.match(/data-stat="pick_overall" csk="(\d+)"/)?.[1]
		if (!overall) continue
		const team = row.match(
			/data-stat="team_id"[^>]*><a href="\/teams\/(\w+)\/draft\.html" title="([^"]+)"/,
		)
		const player = row.match(
			/data-stat="player"[^>]*>(?:<a href='\/players\/\w\/([a-z0-9]+)\.html'>)?([^<]+)/,
		)
		if (!player?.[2]) continue
		picks.push({
			year,
			round,
			overall: Number(overall),
			teamAbbreviation: team?.[1] ? (NBA_FRANCHISES[team[1]] ?? null) : null,
			teamName: team?.[2] ? decodeEntities(team[2]) : null,
			sourceId: player[1] ?? null,
			name: decodeEntities(player[2]).trim(),
		})
	}
	return picks
}

export async function loadNbaDrafts(log: Log): Promise<SourcePick[]> {
	const lastYear = new Date().getUTCFullYear()
	const picks: SourcePick[] = []
	for (let year = FIRST_DRAFT; year <= lastYear; year++) {
		const res = await politeFetch(brefDraftUrl(year))
		// This year's page doesn't exist until the draft happens.
		if (res.status === 404) {
			await res.body?.cancel()
			continue
		}
		if (!res.ok) throw new Error(`bref draft ${year} (${res.status})`)
		const yearPicks = parseBrefDraft(await res.text(), year)
		log(`nba: ${year} ${yearPicks.length} picks`)
		picks.push(...yearPicks)
	}
	return picks
}
