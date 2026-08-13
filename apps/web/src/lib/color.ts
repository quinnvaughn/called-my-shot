// Picks readable foreground text (black or white) for an arbitrary hex
// background - team colors have no guaranteed contrast against either, so a
// hardcoded text color breaks for whichever teams land on the wrong side
// (e.g. white text on a bright gold background, same problem in reverse as
// the raw-team-color-as-text-color issue this was written to avoid).
export function readableTextColor(hex: string): string {
	const { r, g, b } = hexToRgb(hex)
	// YIQ perceived brightness - a cheap, standard heuristic for exactly this
	// "pick black or white text" problem, no need for full WCAG contrast math.
	const yiq = (r * 299 + g * 587 + b * 114) / 1000
	return yiq >= 128 ? "#000000" : "#ffffff"
}

// Low-opacity tint of an arbitrary hex color - team colors, so this can't be
// a themed `*.subtle` token (those only exist for the fixed brand/status
// palette).
export function hexToRgba(hex: string, alpha: number): string {
	const { r, g, b } = hexToRgb(hex)
	return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
	const normalized = hex.replace("#", "")
	const value =
		normalized.length === 3
			? normalized
					.split("")
					.map((c) => c + c)
					.join("")
			: normalized
	return {
		r: Number.parseInt(value.slice(0, 2), 16),
		g: Number.parseInt(value.slice(2, 4), 16),
		b: Number.parseInt(value.slice(4, 6), 16),
	}
}
