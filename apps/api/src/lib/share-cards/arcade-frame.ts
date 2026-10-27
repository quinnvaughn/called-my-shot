import { SPORTS_TIME_ZONE } from "@called-my-shot/schemas"
import { DateTime } from "luxon"
import { COLOR } from "../brand-palette"
import { el, type SatoriNode } from "../share-image"
import { brandWordmark } from "./brand-wordmark"
import { SHARE_CARD_SIZE } from "./frame"

// The layout every Arcade card shares, a result or today's puzzle alike: the
// game's panel on the left in its own color (what game, the whole rule, the
// day and league), and the card's own content on the right above the
// wordmark.

const WORDMARK_SCALE = 1.4

export type ArcadePanel = {
	color: string
	// The game's name, one line each.
	title: string[]
	// The title's size, for a name with a line too long for the default.
	titlePx?: number
	// The whole rule, for someone who's never played.
	rule: string
	day: string
	league: string
}

// Archive and result cards alike show the day this way: "OCT 22".
export function arcadeDayLabel(day: string): string {
	return DateTime.fromISO(day, { zone: SPORTS_TIME_ZONE })
		.toFormat("LLL d")
		.toUpperCase()
}

// An empty slot, for squares not played yet.
export function emptySquare(px: number): SatoriNode {
	return el(
		"div",
		{
			display: "flex",
			width: `${px}px`,
			height: `${px}px`,
			borderRadius: "16px",
			backgroundColor: COLOR.cardMuted,
			border: `2px solid ${COLOR.borderEmphasized}`,
		},
		[],
	)
}

function panel(p: ArcadePanel): SatoriNode {
	return el(
		"div",
		{
			display: "flex",
			flexDirection: "column",
			justifyContent: "space-between",
			width: "400px",
			padding: "44px 40px",
			backgroundColor: p.color,
			color: COLOR.ink,
		},
		[
			el("div", { display: "flex", flexDirection: "column", gap: "22px" }, [
				el(
					"div",
					{
						display: "flex",
						flexDirection: "column",
						fontFamily: "Archivo Black",
						fontSize: `${p.titlePx ?? 72}px`,
						lineHeight: 0.95,
					},
					p.title.map((line) => el("span", { display: "flex" }, line)),
				),
				el(
					"span",
					{
						display: "flex",
						fontFamily: "Inter",
						fontWeight: 600,
						fontSize: "24px",
						lineHeight: 1.3,
					},
					p.rule,
				),
			]),
			el(
				"div",
				{
					display: "flex",
					flexDirection: "column",
					gap: "6px",
					fontFamily: "Space Mono",
					fontWeight: 700,
					fontSize: "26px",
					letterSpacing: "1px",
				},
				[
					el("span", { display: "flex" }, arcadeDayLabel(p.day)),
					el("span", { display: "flex" }, p.league),
				],
			),
		],
	)
}

// `top` and `body` sit at the top and middle of the right side, spread over
// its height, with the wordmark at the bottom.
export function arcadeCard(
	p: ArcadePanel,
	top: SatoriNode,
	body: SatoriNode,
): SatoriNode {
	return el(
		"div",
		{
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
					flex: "1",
					borderRadius: "20px",
					overflow: "hidden",
					border: `1px solid ${COLOR.border}`,
				},
				[
					panel(p),
					el(
						"div",
						{
							display: "flex",
							flexDirection: "column",
							flex: "1",
							justifyContent: "space-between",
							padding: "44px 48px",
							backgroundColor: COLOR.card,
						},
						[
							top,
							body,
							el(
								"div",
								{
									display: "flex",
									alignItems: "center",
									justifyContent: "space-between",
									fontFamily: "Space Mono",
									fontSize: "18px",
									color: COLOR.dim,
								},
								[
									brandWordmark(
										(n: number) => `${Math.round(n * WORDMARK_SCALE)}px`,
										WORDMARK_SCALE,
									),
									el("span", { display: "flex" }, "calledmyshot.com"),
								],
							),
						],
					),
				],
			),
		],
	)
}

// The big line in the middle of a card: "GOT IT IN 3", "CAN YOU NAME IT?".
// A today card's question runs longer than a result, so it sets a smaller
// size to stay on one line.
export function arcadeHeadline(text: string, px = 64): SatoriNode {
	return el(
		"span",
		{
			display: "flex",
			fontFamily: "Archivo Black",
			fontSize: `${px}px`,
			color: COLOR.ink,
		},
		text,
	)
}

// The line under it.
export function arcadeSubline(text: string): SatoriNode {
	return el(
		"span",
		{
			display: "flex",
			fontFamily: "Inter",
			fontWeight: 600,
			fontSize: "28px",
			lineHeight: 1.3,
			color: COLOR.linen,
		},
		text,
	)
}
