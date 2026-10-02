// A won-lost record as ESPN writes it: "31-9", "12-4-1", or the NHL's
// "48-20-12, 108 PTS". The third count means different things by league - a
// tie in the NFL, an overtime or shootout loss in the NHL - so the league
// decides which field it lands in. otLosses is null for a league without the
// concept rather than 0, so a display can tell "no OT losses yet" apart from
// "this league doesn't have them".
export type ParsedTeamRecord = {
	wins: number
	losses: number
	ties: number
	otLosses: number | null
}

export function hasOtLosses(leagueSlug: string): boolean {
	return leagueSlug === "nhl"
}

// Null when the text has no won-lost pair in it. A split ESPN has no games for
// yet ("-" or empty) reads as all zeroes, which the caller can treat as no
// games.
export function parseTeamRecord(
	text: string | null | undefined,
	leagueSlug: string,
): ParsedTeamRecord | null {
	// The NHL appends its standings points after a comma.
	const [counts = ""] = (text ?? "").split(",")
	const parts = counts.split("-").map((part) => Number(part.trim()))
	if (parts.length < 2) return null
	const [wins, losses, third] = parts
	if (!Number.isFinite(wins) || !Number.isFinite(losses)) return null
	const thirdCount = Number.isFinite(third) ? (third as number) : 0
	const otLosses = hasOtLosses(leagueSlug)
	return {
		wins: wins as number,
		losses: losses as number,
		ties: otLosses ? 0 : thirdCount,
		otLosses: otLosses ? thirdCount : null,
	}
}

export function recordGames(record: {
	wins: number
	losses: number
	ties: number
	otLosses: number | null
}): number {
	return record.wins + record.losses + record.ties + (record.otLosses ?? 0)
}
