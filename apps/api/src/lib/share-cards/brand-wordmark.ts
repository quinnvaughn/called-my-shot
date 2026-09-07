import { COLOR } from "../brand-palette"
import { el, type SatoriNode, svgEl } from "../share-image"

// "CALLED MY SH" + a crosshair standing in for the O + "T" - the same lockup
// apps/web/src/assets/logo.svg carries, built natively here instead of
// rasterizing that SVG through resvg: it embeds its own @font-face copy of
// Archivo Black, and resvg silently fails to load it and substitutes a
// fallback with different glyph widths, throwing off the icon's fixed
// position relative to the text. satori already has a real, working copy of
// Archivo Black loaded, so reusing that avoids the whole problem.
//
// Shared by both share cards and by scripts/render-email-logo.ts, which
// renders it once to the PNG the resolution email uses (mail clients strip
// inline SVG, so the email needs a raster). `px` is passed in because each
// caller measures against its own design-time reference width.
export function brandWordmark(
	px: (n: number) => string,
	scale: number,
): SatoriNode {
	const fontSize = px(20)
	// Ratio taken from the real artwork: logo.svg draws the text at font-size
	// 90 and the crosshair as an 80-unit box scaled 0.9762, i.e. 78.1/90.
	// Rendering it 1:1 with the font size (which this used to do) makes the
	// crosshair noticeably too big for the letters.
	const iconSize = Math.round(20 * 0.868 * scale)
	const textStyle = {
		display: "flex",
		fontFamily: "Archivo Black",
		fontSize,
		color: COLOR.ink,
	}
	const tick = (x1: number, y1: number, x2: number, y2: number) =>
		svgEl("line", {
			x1,
			y1,
			x2,
			y2,
			// Cream, not orange. Only the ring and the centre dot are orange in
			// apps/web/src/assets/logo.svg - the share cards had all four ticks
			// orange, which is what made the mark read as a solid blob instead
			// of a crosshair.
			stroke: COLOR.ink,
			strokeWidth: 6,
			strokeLinecap: "square",
		})

	return el("div", { display: "flex", alignItems: "center", gap: px(2) }, [
		el("span", textStyle, "CALLED MY SH"),
		svgEl(
			"svg",
			{
				viewBox: "0 0 80 80",
				width: iconSize,
				height: iconSize,
				style: { display: "flex" },
			},
			[
				svgEl("circle", {
					cx: 40,
					cy: 40,
					r: 26,
					fill: "none",
					stroke: COLOR.primaryDefault,
					strokeWidth: 6,
				}),
				tick(40, 4, 40, 17),
				tick(40, 63, 40, 76),
				tick(4, 40, 17, 40),
				tick(63, 40, 76, 40),
				svgEl("circle", { cx: 40, cy: 40, r: 9, fill: COLOR.primaryDefault }),
			],
		),
		el("span", textStyle, "T"),
	])
}
