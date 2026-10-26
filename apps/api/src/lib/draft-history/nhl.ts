import { nhlFranchiseTeam } from "../franchise-history/franchise-map"
import { fetchJson } from "../franchise-history/http"
import type { Log } from "../franchise-history/types"
import type { SourcePick } from "./types"

// The NHL's drafts from 1963 on, from records.nhl.com: every pick in one
// response, keyed by the same NHL player id the franchise history uses.
// Picks are made by a team id, which the team list turns into a franchise
// and the name the team had then.

const RECORDS = "https://records.nhl.com/site/api"

export type NhlDraftRow = {
	draftYear: number
	overallPickNumber: number
	roundNumber: number
	draftedByTeamId: number
	triCode: string
	playerId: number | null
	playerName: string
}

export type NhlTeamRow = {
	id: number
	franchiseId: number | null
	fullName: string
}

// Picks the league voided or took away, listed under these names with no
// player.
const NOT_A_PLAYER = new Set(["INVALID", "FORFEIT"])

export function parseNhlDraft(
	rows: NhlDraftRow[],
	teams: NhlTeamRow[],
): SourcePick[] {
	const byId = new Map(teams.map((team) => [team.id, team]))
	return rows
		.filter((row) => !NOT_A_PLAYER.has(row.playerName))
		.map((row) => {
			const team = byId.get(row.draftedByTeamId)
			return {
				year: row.draftYear,
				round: row.roundNumber,
				overall: row.overallPickNumber,
				teamAbbreviation:
					team?.franchiseId != null
						? nhlFranchiseTeam(team.franchiseId, row.triCode)
						: null,
				// "Winnipeg Jets (1979)" is how the records tell the first Jets
				// from today's.
				teamName: team?.fullName.replace(/\s*\(\d{4}\)$/, "") ?? null,
				sourceId: row.playerId === null ? null : String(row.playerId),
				name: row.playerName,
			}
		})
}

export async function loadNhlDrafts(log: Log): Promise<SourcePick[]> {
	const [draft, teams] = await Promise.all([
		fetchJson<{ data: NhlDraftRow[] }>(`${RECORDS}/draft?limit=-1`),
		fetchJson<{ data: NhlTeamRow[] }>(`${RECORDS}/team`),
	])
	const picks = parseNhlDraft(draft.data, teams.data)
	log(`nhl: ${picks.length} draft picks`)
	return picks
}
