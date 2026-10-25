type ScopedPrompt = {
	league: { abbreviation: string } | null
	team?: { name: string } | null
	positions?: readonly string[]
	fromYear?: number | null
	toYear?: number | null
}

// Who a prompt's picks come from, as the short label shown with it: "NBA",
// "NBA · Boston Celtics" with the team's name when it has one, "Any sport"
// for a prompt open to every league, then any positions and years it's
// narrowed to ("NBA · PG, SG · 2010–2019").
export function promptScope(prompt: ScopedPrompt): string {
	return [
		prompt.league ? prompt.league.abbreviation : "Any sport",
		prompt.team?.name,
		promptFilters(prompt),
	]
		.filter(Boolean)
		.join(" · ")
}

// Just the positions and years, or null when it has neither.
export function promptFilters(prompt: ScopedPrompt): string | null {
	const parts = [
		prompt.positions && prompt.positions.length > 0
			? prompt.positions.join(", ")
			: null,
		yearsLabel(prompt.fromYear ?? null, prompt.toYear ?? null),
	].filter(Boolean)
	return parts.length > 0 ? parts.join(" · ") : null
}

function yearsLabel(from: number | null, to: number | null): string | null {
	if (from !== null && to !== null) {
		return from === to ? String(from) : `${from}–${to}`
	}
	if (from !== null) return `${from} on`
	if (to !== null) return `Through ${to}`
	return null
}
