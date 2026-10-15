export type FieldOption = { fieldPct: number | null }

// Descending, dropping options nobody's called yet (fieldPct null).
export function rankByField(options: FieldOption[]): number[] {
	return options
		.map((o) => o.fieldPct)
		.filter((p): p is number => p !== null)
		.sort((a, b) => b - a)
}

// "The field itself has no clear leader" - top two options within 10 points
// of each other, once there's enough field to trust (5+ callers - below
// that, fieldPct is too noisy: 1 vs 2 callers can swing 50 points on the
// very next call, which would flag nearly every fresh question as
// contested).
const MIN_CALLERS = 5
const MAX_GAP_PTS = 10

export function isContested(options: FieldOption[], callCount: number): boolean {
	if (callCount < MIN_CALLERS) return false
	const ranked = rankByField(options)
	if (ranked.length < 2) return false
	const [leader, runnerUp] = ranked
	return leader - runnerUp <= MAX_GAP_PTS
}

// Leading option by live fieldPct, dropping options nobody's called yet -
// same "what is the field actually saying" question isContested/rankByField
// answer, just keeping the label alongside the number for display.
export function leadingOption<T extends FieldOption>(options: T[]): T | null {
	let best: T | null = null
	for (const option of options) {
		if (option.fieldPct === null) continue
		if (!best || option.fieldPct > (best.fieldPct ?? -1)) best = option
	}
	return best
}
