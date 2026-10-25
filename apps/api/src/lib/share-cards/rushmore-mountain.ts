// The flat look every Mount Rushmore image shares: the franchise's own color
// as the background, a jagged ridge in a darker shade of it, and the four
// faces standing along the ridge in rings. Anything printed on the color
// (names, title, link) uses the team's foreground: white on a dark color,
// near-black on a light one, so a Spurs silver reads as well as a Celtics
// green.

import { type SatoriNode, svgEl } from "../share-image"

export type RushmoreLayout = "landscape" | "portrait"

// The app's own night blue, for a league-wide prompt with no franchise.
const NO_TEAM = "#1E2E40"

export type RushmorePalette = {
	background: string
	foreground: string
	ridge: string
	// The farther range behind it, between the background and the ridge.
	farRidge: string
	// Behind each face, a shade off the background so a cutout photo's
	// edges don't vanish into it.
	faceBacking: string
}

function parseHex(hex: string): [number, number, number] | null {
	const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
	if (!m?.[1]) return null
	const n = Number.parseInt(m[1], 16)
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// a blended toward b by t. satori and resvg have no color-mix, so the shades
// are worked out here.
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

// Relative luminance, for picking the foreground.
function luminance(hex: string): number {
	const [r, g, b] = (parseHex(hex) ?? [0, 0, 0]).map((c) => {
		const s = c / 255
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
	}) as [number, number, number]
	return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function rushmorePalette(teamColor: string | null): RushmorePalette {
	const background =
		teamColor && parseHex(teamColor)
			? `#${teamColor.trim().replace(/^#/, "")}`
			: NO_TEAM
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
			: mixHex(background, "#000000", light ? 0.28 : 0.34),
		farRidge: nearBlack
			? mixHex(background, "#FFFFFF", 0.07)
			: mixHex(background, "#000000", light ? 0.13 : 0.16),
		faceBacking: nearBlack
			? mixHex(background, "#FFFFFF", 0.08)
			: mixHex(background, "#000000", 0.18),
	}
}

// Two skylines across the full width, as x, y fractions of their box: a
// farther range with taller peaks, and a nearer one the faces stand on.
const FAR: [number, number][] = [
	[0, 0.42],
	[0.06, 0.3],
	[0.12, 0.37],
	[0.2, 0.12],
	[0.28, 0.27],
	[0.36, 0.17],
	[0.45, 0.33],
	[0.55, 0.05],
	[0.63, 0.23],
	[0.72, 0.13],
	[0.8, 0.29],
	[0.88, 0.15],
	[0.95, 0.25],
	[1, 0.19],
]
const NEAR: [number, number][] = [
	[0, 0.6],
	[0.08, 0.49],
	[0.16, 0.57],
	[0.26, 0.41],
	[0.36, 0.54],
	[0.47, 0.39],
	[0.58, 0.51],
	[0.68, 0.37],
	[0.78, 0.49],
	[0.88, 0.41],
	[1, 0.55],
]

// Both ranges as one absolutely positioned SVG filling the given box: the
// far one a shade off the background, the near one in the ridge color.
export function rushmoreSkyline(
	box: { left: number; top: number; width: number; height: number },
	palette: RushmorePalette,
): SatoriNode {
	const polygon = (outline: [number, number][]) =>
		[...outline, [1, 1] as const, [0, 1] as const]
			.map(
				([x, y]) =>
					`${(x * box.width).toFixed(1)},${(y * box.height).toFixed(1)}`,
			)
			.join(" ")
	return svgEl(
		"svg",
		{
			viewBox: `0 0 ${box.width} ${box.height}`,
			width: box.width,
			height: box.height,
			style: { position: "absolute", left: box.left, top: box.top },
		},
		[
			svgEl("polygon", { points: polygon(FAR), fill: palette.farRidge }),
			svgEl("polygon", { points: polygon(NEAR), fill: palette.ridge }),
		],
	)
}
