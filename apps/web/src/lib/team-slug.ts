// A team space's address segment: its abbreviation, lowercased
// (/leagues/nba/teams/bos). Abbreviations are unique within a league.
export function teamSlug(abbreviation: string): string {
	return abbreviation.toLowerCase()
}
