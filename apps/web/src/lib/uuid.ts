const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Tells a league room's slug ("nfl") apart from the uuid the same route used
// to be addressed by, so a link shared before the move can be redirected
// rather than 404'd - see routes/_app/leagues/$leagueSlug.tsx.
export function isUuid(value: string): boolean {
	return UUID_RE.test(value)
}
