import type { PageSpace } from "#/components/app-shell/space"
import { teamSlug } from "#/lib/team-slug"

// The space a prompt is about: its team's, else its league's. Null for a
// prompt open to every sport.
export function promptSpace(prompt: {
	league: { id: string } | null
	team: { abbreviation: string } | null
}): PageSpace | null {
	if (!prompt.league) return null
	return prompt.team
		? {
				kind: "team",
				leagueId: prompt.league.id,
				teamSlug: teamSlug(prompt.team.abbreviation),
			}
		: { kind: "league", leagueId: prompt.league.id }
}
