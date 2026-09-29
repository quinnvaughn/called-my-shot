// The frame every fixed-size og:image card shares (call, ballot, streak,
// sweep, report card, profile): a header band with the wordmark and an eyebrow, a hero
// band the card fills, and a footer band with a row of stat cells over the
// @username and site line. Only the hero differs between them, so the cards
// read as one set.
import { COLOR } from "../brand-palette"
import { el, type SatoriNode } from "../share-image"
import { brandWordmark } from "./brand-wordmark"

// 1200x630 exactly, because that is what X's summary_large_image crops to.
// A card rendered at whatever height its content needs loses the top and
// bottom of itself in every unfurl.
//
// Every size in these cards is a real pixel at that resolution.
export const SHARE_CARD_SIZE = { width: 1200, height: 630 }

// brandWordmark measures against its caller's own reference width, so it
// takes a px()/scale pair. 1.7 puts the lockup at 34px, in scale with the
// header rule beside it.
const WORDMARK_SCALE = 1.7
const wordmarkPx = (n: number) => `${Math.round(n * WORDMARK_SCALE)}px`

// The cap on a person's display name wherever a card states it.
export const PERSON_MAX = 40

const HEADER_HEIGHT = 96
const FOOTER_HEIGHT = 168

// Given a fixed height, satori clips anything that doesn't fit the viewBox -
// silently, with no warning and no scaling, and an overflowing flex child
// paints straight over its siblings rather than pushing them. So every
// free-text field on these cards is capped in JS rather than trusted to wrap
// into whatever space is left.
export function clamp(text: string, max: number): string {
	if (text.length <= max) return text
	return `${text.slice(0, max - 1).trimEnd()}…`
}

export function eyebrow(text: string, color = COLOR.dim): SatoriNode {
	return el(
		"span",
		{
			display: "flex",
			fontFamily: "Space Mono",
			fontWeight: 500,
			fontSize: "17px",
			letterSpacing: "1px",
			textTransform: "uppercase",
			color,
		},
		text,
	)
}

// The footer's unit: a label stacked over a value. Horizontal, so a row of
// them fits the footer band's fixed height.
export function statCell(
	label: string,
	value: string,
	{ color = COLOR.ink, big = false }: { color?: string; big?: boolean } = {},
): SatoriNode {
	return el("div", { display: "flex", flexDirection: "column", gap: "8px" }, [
		eyebrow(label),
		el(
			"span",
			{
				display: "flex",
				fontFamily: big ? "Archivo Black" : "Inter",
				fontWeight: 600,
				fontSize: big ? "40px" : "28px",
				color,
			},
			value,
		),
	])
}

export type CardFrameOptions = {
	// The header's right-hand eyebrow.
	eyebrow: string
	// The band between header and footer. It must take `flex: "1"` itself, so
	// it absorbs whatever height the fixed bands leave.
	hero: SatoriNode
	// The footer's stat row, spread edge to edge.
	cells: SatoriNode[]
	username: string
	// The gap between the stat row and the username line.
	footerGap?: string
	borderColor?: string
}

export function cardFrame({
	eyebrow: eyebrowText,
	hero,
	cells,
	username,
	footerGap = "18px",
	borderColor = COLOR.border,
}: CardFrameOptions): SatoriNode {
	const bottomLine: SatoriNode[] = [
		el("span", { display: "flex" }, `@${username}`),
		el("span", { display: "flex" }, "calledmyshot.com"),
	]

	return el(
		"div",
		{
			// Opaque and full-bleed. The rounded card is inset inside this
			// instead of being the root itself: at a fixed size, a border-radius
			// on the outermost node leaves transparent PNG corners, which X
			// composites onto white and Discord onto near-black - the same file
			// showing two different frames.
			display: "flex",
			width: `${SHARE_CARD_SIZE.width}px`,
			height: `${SHARE_CARD_SIZE.height}px`,
			padding: "14px",
			backgroundColor: COLOR.paper,
			fontFamily: "Inter",
		},
		[
			el(
				"div",
				{
					display: "flex",
					flexDirection: "column",
					flex: "1",
					backgroundColor: COLOR.card,
					color: COLOR.ink,
					border: `1px solid ${borderColor}`,
					borderRadius: "20px",
				},
				[
					// Header. Fixed height, like the footer - the hero between
					// them is the only band allowed to absorb slack, so long
					// content can never push either of them off the card.
					el(
						"div",
						{
							display: "flex",
							height: `${HEADER_HEIGHT}px`,
							flexShrink: 0,
							alignItems: "center",
							justifyContent: "space-between",
							paddingLeft: "36px",
							paddingRight: "36px",
							borderBottom: `1px solid ${COLOR.border}`,
						},
						[brandWordmark(wordmarkPx, WORDMARK_SCALE), eyebrow(eyebrowText)],
					),
					hero,
					el(
						"div",
						{
							display: "flex",
							flexDirection: "column",
							height: `${FOOTER_HEIGHT}px`,
							flexShrink: 0,
							justifyContent: "center",
							gap: footerGap,
							paddingLeft: "36px",
							paddingRight: "36px",
							borderTop: `1px solid ${COLOR.border}`,
						},
						[
							el(
								"div",
								{
									display: "flex",
									alignItems: "flex-end",
									justifyContent: "space-between",
									width: "100%",
								},
								cells,
							),
							el(
								"div",
								{
									display: "flex",
									alignItems: "center",
									justifyContent: "space-between",
									width: "100%",
									fontFamily: "Space Mono",
									fontSize: "17px",
									color: COLOR.dim,
								},
								bottomLine,
							),
						],
					),
				],
			),
		],
	)
}
