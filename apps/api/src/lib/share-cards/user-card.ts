import { DateTime } from "luxon"
import { el, type SatoriNode, svgEl } from "../share-image"

// This PNG is never displayed in-app (see share-image-panel.tsx) - it's only
// ever downloaded or copied elsewhere (Slack, Twitter, Notes, Finder
// QuickLook), none of which know it was laid out against a 475px CSS
// reference. So the target is a fixed resolution sized for that kind of
// external viewing/pasting - roughly what OG/Twitter card images use -
// rather than "2x whatever the in-app preview happens to be." REFERENCE_WIDTH
// stays as the layout's design-time reference (it's what every token below
// - padding "4" = 16px, fontSize "xl" = 20px, etc. - was measured against in
// share-card-preview.tsx); SCALE is just how much bigger the export is than
// that reference. Height is intentionally omitted (see renderShareImage) -
// this is a card with natural content height, not a fixed poster.
const REFERENCE_WIDTH = 475
const TARGET_WIDTH = 1200
const SCALE = TARGET_WIDTH / REFERENCE_WIDTH
export const USER_SHARE_CARD_SIZE = { width: TARGET_WIDTH }

function px(n: number): string {
	return `${Math.round(n * SCALE)}px`
}

// Real token values from apps/web/panda.config.ts's dark palette and the
// components this mirrors (Card, Avatar, Eyebrow) - not a separate palette.
// Keep in sync by hand since satori can't read the actual CSS variables.
// This used to hold the "light theme: #..." values panda.config.ts notes
// per-token - leftover from an old flip-to-light experiment that was
// reverted, not a live theme anyone can select today - so the exported PNG
// was rendering as a white card while the app itself has been dark-only for
// a while. Switched to the dark values so the export matches what's
// actually on screen.
const COLOR = {
	ink: "#F5F1E8", // fg.default
	dim: "#8A8A84", // fg.muted
	steel: "#96938A", // fg.subtle
	border: "#2A2A28", // border.default
	card: "#151513", // bg.surface
	cardMuted: "#1B1B18", // bg.subtle (Avatar's fill)
	primarySubtle: "#3A1E12", // primary.subtle
	primaryDefault: "#FF5A1F", // primary.default
	successSubtle: "#112921", // success.subtle
	verifiedVibrant: "#34D399",
}

export type UserShareCardData = {
	name: string
	username: string
	memberSince: string // ISO date
	// e.g. "All-time" or "NBA" - distinguishes a career-wide card from a
	// single league's
	scopeTag: string
	rank: number
	totalPoints: number
	accuracy: number | null
	callCount: number
}

// Mirrors Eyebrow (size="sm" variant="neutral"): mono, uppercase, dim.
function eyebrow(text: string): SatoriNode {
	return el(
		"span",
		{
			display: "flex",
			fontFamily: "Space Mono",
			fontWeight: 500,
			fontSize: px(11),
			letterSpacing: px(0.5),
			textTransform: "uppercase",
			color: COLOR.dim,
		},
		text,
	)
}

// Mirrors <Brand> (apps/web/src/components/ui/brand.tsx), which renders
// /logo.svg - "CALLED MY SH" + a crosshair standing in for the O + "T".
// Built natively here instead of rasterizing that SVG through resvg: the
// SVG embeds its own @font-face copy of Archivo Black, and resvg silently
// fails to load it and substitutes a fallback font with different glyph
// widths, throwing off the icon's fixed position relative to the text (a
// visible gap before the icon, wrong-looking weight). satori already has a
// real, working copy of Archivo Black loaded (it's what renders the name
// below correctly), so reusing that avoids the whole problem.
function brandWordmark(): SatoriNode {
	const fontSize = px(20)
	const iconSize = Math.round(20 * SCALE)
	const textStyle = {
		display: "flex",
		fontFamily: "Archivo Black",
		fontSize,
		color: COLOR.ink,
	}
	return el("div", { display: "flex", alignItems: "center", gap: px(4) }, [
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
				svgEl("line", {
					x1: 40,
					y1: 4,
					x2: 40,
					y2: 17,
					stroke: COLOR.primaryDefault,
					strokeWidth: 6,
					strokeLinecap: "square",
				}),
				svgEl("line", {
					x1: 40,
					y1: 63,
					x2: 40,
					y2: 76,
					stroke: COLOR.primaryDefault,
					strokeWidth: 6,
					strokeLinecap: "square",
				}),
				svgEl("line", {
					x1: 4,
					y1: 40,
					x2: 17,
					y2: 40,
					stroke: COLOR.primaryDefault,
					strokeWidth: 6,
					strokeLinecap: "square",
				}),
				svgEl("line", {
					x1: 63,
					y1: 40,
					x2: 76,
					y2: 40,
					stroke: COLOR.primaryDefault,
					strokeWidth: 6,
					strokeLinecap: "square",
				}),
				svgEl("circle", {
					cx: 40,
					cy: 40,
					r: 9,
					fill: COLOR.primaryDefault,
				}),
			],
		),
		el("span", textStyle, "T"),
	])
}

// Mirrors HeroStat.
function heroStat(
	label: string,
	value: string,
	tone: "accent" | "good",
): SatoriNode {
	return el(
		"div",
		{
			display: "flex",
			flex: "1",
			flexDirection: "column",
			alignItems: "center",
			gap: px(1),
			borderRadius: px(8),
			paddingTop: px(12),
			paddingBottom: px(12),
			paddingLeft: px(8),
			paddingRight: px(8),
			backgroundColor:
				tone === "good" ? COLOR.successSubtle : COLOR.primarySubtle,
		},
		[
			eyebrow(label),
			el(
				"span",
				{
					display: "flex",
					fontFamily: "Archivo Black",
					fontSize: px(30),
					color: tone === "good" ? COLOR.verifiedVibrant : COLOR.primaryDefault,
				},
				value,
			),
		],
	)
}

// Mirrors ShareStatRow.
function statRow(label: string, value: string): SatoriNode {
	return el(
		"div",
		{
			display: "flex",
			alignItems: "center",
			justifyContent: "space-between",
			width: "100%",
		},
		[
			eyebrow(label),
			el(
				"span",
				{
					display: "flex",
					fontFamily: "Inter",
					fontWeight: 600,
					fontSize: px(14),
				},
				value,
			),
		],
	)
}

export function buildUserShareCard(data: UserShareCardData): SatoriNode {
	const accuracyText =
		data.accuracy !== null ? `${Math.round(data.accuracy)}%` : "-"
	const accuracyTone: "accent" | "good" =
		data.accuracy !== null && data.accuracy >= 50 ? "good" : "accent"
	const initial = data.name.charAt(0).toUpperCase()

	return el(
		"div",
		{
			display: "flex",
			flexDirection: "column",
			width: `${USER_SHARE_CARD_SIZE.width}px`,
			backgroundColor: COLOR.card,
			color: COLOR.ink,
			border: `${px(1)} solid ${COLOR.border}`,
			borderRadius: px(16),
			fontFamily: "Inter",
		},
		[
			// Header
			el(
				"div",
				{
					display: "flex",
					flexDirection: "column",
					// Without this, brandWordmark's row stretches to the header's
					// full width (column flex's default cross-axis stretch) and
					// sits left-aligned inside it - the nested "everything below
					// brand" div sets its own centering, but brandWordmark itself
					// doesn't, so it needs the parent to center it instead.
					alignItems: "center",
					gap: px(12),
					padding: px(16),
					borderBottom: `${px(1)} solid ${COLOR.border}`,
				},
				[
					brandWordmark(),
					el(
						"div",
						{
							display: "flex",
							flexDirection: "column",
							alignItems: "center",
							gap: px(16),
						},
						[
							el(
								"div",
								{
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									width: px(64),
									height: px(64),
									borderRadius: px(32),
									backgroundColor: COLOR.cardMuted,
									border: `${px(1)} solid ${COLOR.border}`,
									fontFamily: "Space Mono",
									fontSize: px(20),
									color: COLOR.ink,
								},
								initial,
							),
							el(
								"div",
								{
									display: "flex",
									flexDirection: "column",
									alignItems: "center",
									gap: px(4),
								},
								[
									eyebrow(data.scopeTag),
									el(
										"span",
										{
											display: "flex",
											fontFamily: "Archivo Black",
											fontSize: px(20),
										},
										data.name,
									),
									el(
										"span",
										{
											display: "flex",
											fontFamily: "Space Mono",
											fontSize: px(12),
											color: COLOR.steel,
										},
										`@${data.username} · Member since ${DateTime.fromISO(data.memberSince).toFormat("MMM yyyy")}`,
									),
								],
							),
						],
					),
				],
			),
			// Body
			el(
				"div",
				{
					display: "flex",
					flexDirection: "column",
					gap: px(12),
					padding: px(16),
				},
				[
					el("div", { display: "flex", gap: px(12), width: "100%" }, [
						heroStat("Rank", `#${data.rank}`, "accent"),
						heroStat("Accuracy", accuracyText, accuracyTone),
					]),
					statRow("Calls made", data.callCount.toLocaleString()),
				],
			),
			// Footer
			el(
				"div",
				{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					padding: px(16),
					borderTop: `${px(1)} solid ${COLOR.border}`,
					fontFamily: "Space Mono",
					fontSize: px(11),
					color: COLOR.dim,
				},
				[
					el(
						"span",
						{ display: "flex" },
						`calledmyshot.com/user/${data.username}`,
					),
					el(
						"span",
						{ display: "flex" },
						`${data.totalPoints.toLocaleString()} pts`,
					),
				],
			),
		],
	)
}
