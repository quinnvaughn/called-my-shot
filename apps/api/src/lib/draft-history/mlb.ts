import { MLB_FRANCHISES } from "../franchise-history/franchise-map"
import { fetchJson, mapPool } from "../franchise-history/http"
import type { Log } from "../franchise-history/types"
import type { SourcePick } from "./types"

// MLB's June drafts from 1965 on, one statsapi.mlb.com response per year,
// keyed by the MLBAM id the franchise history uses. A draft runs to 40 or
// more rounds of players who never reach the majors, so only the first
// round (the slots a redraft can fill) and anyone who went on to debut are
// kept.

const STATSAPI = "https://statsapi.mlb.com/api/v1"
const FIRST_DRAFT = 1965

type MlbDraftPick = {
	pickRound: string
	pickNumber: number
	isPass?: boolean
	team: { id: number; name: string }
	person?: { id: number; fullName: string; mlbDebutDate?: string }
}

export type MlbDraftJson = {
	drafts: {
		draftYear: number
		rounds: { round: string; picks: MlbDraftPick[] }[]
	}
}

// teamNames is statsapi's name for each team id that season ("Tampa Bay
// Devil Rays" in 2003), since the draft itself gives today's.
export function parseMlbDraft(
	json: MlbDraftJson,
	teamNames: Map<number, string>,
): SourcePick[] {
	const year = json.drafts.draftYear
	const picks: SourcePick[] = []
	for (const { round, picks: roundPicks } of json.drafts.rounds) {
		// "1", "2"...; supplemental rounds are "C-1", "1C" and the like.
		const number = /^\d+$/.test(round) ? Number(round) : null
		for (const pick of roundPicks) {
			if (pick.isPass || !pick.person) continue
			if (number !== 1 && !pick.person.mlbDebutDate) continue
			picks.push({
				year,
				round: number,
				overall: pick.pickNumber,
				teamAbbreviation: MLB_FRANCHISES[pick.team.id] ?? null,
				teamName: teamNames.get(pick.team.id) ?? pick.team.name,
				sourceId: String(pick.person.id),
				name: pick.person.fullName,
			})
		}
	}
	return picks
}

export async function loadMlbDrafts(log: Log): Promise<SourcePick[]> {
	const lastYear = new Date().getUTCFullYear()
	const years = Array.from(
		{ length: lastYear - FIRST_DRAFT + 1 },
		(_, i) => FIRST_DRAFT + i,
	)
	const perYear = await mapPool(years, 4, async (year) => {
		const [draft, { teams }] = await Promise.all([
			fetchJson<MlbDraftJson>(`${STATSAPI}/draft/${year}`),
			fetchJson<{ teams: { id: number; name: string }[] }>(
				`${STATSAPI}/teams?sportId=1&season=${year}`,
			),
		])
		// This year's draft has no picks until it happens.
		if (!draft.drafts?.rounds) return []
		return parseMlbDraft(
			draft,
			new Map(teams.map((team) => [team.id, team.name])),
		)
	})
	const picks = perYear.flat()
	log(`mlb: ${picks.length} draft picks kept`)
	return picks
}
