import { DateTime } from "luxon"
// The dark values here are what the app actually renders - this card once
// used panda.config.ts's "light theme: #..." notes, leftover from a reverted
// flip-to-light experiment, and exported a white card while the app had been
// dark-only for a while.
import { COLOR } from "../brand-palette"
import { brandWordmark } from "./brand-wordmark"
import { el, type SatoriNode } from "../share-image"

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

export type UserShareCardData = {
	name: string
	username: string
	memberSince: string // ISO date
	// e.g. "All-time" or "NBA" - distinguishes a career-wide card from a
	// single league's
	scopeTag: string
	// null until the user has a resolved call in this scope
	rank: number | null
	totalPoints: number
	accuracy: number | null
	resolvedCallCount: number
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
					color: tone === "good" ? COLOR.success : COLOR.primaryDefault,
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
					brandWordmark(px, SCALE),
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
						heroStat(
							"Rank",
							data.rank !== null ? `#${data.rank}` : "N/A",
							"accent",
						),
						heroStat("Accuracy", accuracyText, accuracyTone),
					]),
					statRow("Resolved", data.resolvedCallCount.toLocaleString()),
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
