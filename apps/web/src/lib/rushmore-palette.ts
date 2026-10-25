// The colors a Rushmore is drawn in, the same as its share image
// (apps/api/src/lib/share-cards/rushmore-mountain.ts): the franchise's own
// color behind everything, a darker shade of it for the ridge, and white or
// near-black on top depending on how light the team's color is.

const NO_TEAM = "#1E2E40"

export type RushmorePalette = {
	background: string
	foreground: string
	ridge: string
	// Behind each face, a shade off the background so a cutout photo's edges
	// don't vanish into it.
	faceBacking: string
}

function parseHex(hex: string): [number, number, number] | null {
	const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
	if (!m?.[1]) return null
	const n = Number.parseInt(m[1], 16)
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function mixHex(a: string, b: string, t: number): string {
	const ca = parseHex(a) ?? [0, 0, 0]
	const cb = parseHex(b) ?? [0, 0, 0]
	return `#${ca
		.map((c, i) =>
			Math.round(c + ((cb[i] ?? 0) - c) * t)
				.toString(16)
				.padStart(2, "0"),
		)
		.join("")}`
}

function luminance(hex: string): number {
	const [r, g, b] = (parseHex(hex) ?? [0, 0, 0]).map((c) => {
		const s = c / 255
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
	}) as [number, number, number]
	return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function rushmorePalette(color: string | null | undefined) {
	const background =
		color && parseHex(color) ? `#${color.trim().replace(/^#/, "")}` : NO_TEAM
	const lum = luminance(background)
	const light = lum > 0.45
	// On a near-black team (White Sox, Spurs, Steelers) a darker ridge would
	// vanish, so it goes lighter instead.
	const nearBlack = lum < 0.02
	return {
		background,
		foreground: light ? "#0B0B0C" : "#FFFFFF",
		ridge: nearBlack
			? mixHex(background, "#FFFFFF", 0.14)
			: mixHex(background, "#000000", light ? 0.28 : 0.32),
		faceBacking: nearBlack
			? mixHex(background, "#FFFFFF", 0.08)
			: mixHex(background, "#000000", 0.18),
	} satisfies RushmorePalette
}
