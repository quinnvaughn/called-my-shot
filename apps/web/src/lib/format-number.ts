type SignedOptions = {
	// Writes a zero as "+0" rather than "0", for a total where breaking even
	// still reads as holding ground.
	zeroSign?: boolean
	// "whole" rounds to an integer; "tenth" keeps one decimal on anything that
	// isn't already whole.
	round?: "whole" | "tenth"
}

// A number with its direction spelled out: "+12", "−4", "0". The minus is the
// typographic one (U+2212), the same width as the plus, so a column of signed
// numbers lines up.
export function formatSigned(
	n: number,
	{ zeroSign = false, round }: SignedOptions = {},
): string {
	const value = round === "whole" ? Math.round(n) : n
	const magnitude =
		round === "tenth" && !Number.isInteger(value)
			? Math.abs(value).toFixed(1)
			: String(Math.abs(value))
	if (Number(magnitude) === 0) return zeroSign ? `+${magnitude}` : magnitude
	return value > 0 ? `+${magnitude}` : `−${magnitude}`
}

// A 0-1 ratio as a whole percent: 0.237 → "24%".
export function formatPercent(ratio: number): string {
	return `${Math.round(ratio * 100)}%`
}

// Where the range is inverted (max below min), min wins.
export function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(value, max))
}
