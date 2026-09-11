// The og:image behind /ballots/:slug/:username. It states how much of the
// ballot someone has called and, once members settle, their record and
// points. None of the picks: those are on the page the link opens.
//
// Same fixed 1200x630 and header/hero/footer bands as call-card.ts, for the
// same reasons documented there, and built from its eyebrow/statCell pieces
// so the two cards read as one set.
import { COLOR } from "../brand-palette"
import { el, type SatoriNode } from "../share-image"
import { brandWordmark } from "./brand-wordmark"
import { clamp, eyebrow, statCell } from "./call-card"

const TARGET_WIDTH = 1200
const TARGET_HEIGHT = 630
export const BALLOT_SHARE_CARD_SIZE = {
	width: TARGET_WIDTH,
	height: TARGET_HEIGHT,
}

const WORDMARK_SCALE = 1.7
const wordmarkPx = (n: number) => `${Math.round(n * WORDMARK_SCALE)}px`

// Same measurements as call-card.ts's pick label, which sits in the same slot
// at the same sizes.
const NAME_HERO_MAX = 22
const NAME_MAX = 42
const PERSON_MAX = 40

const HEADER_HEIGHT = 96
const FOOTER_HEIGHT = 168

export type BallotShareCardData = {
	ballotName: string
	leagueAbbr: string
	name: string
	username: string
	calledCount: number
	memberCount: number
	wins: number
	losses: number
	points: number
	// "Locks Sep 14, 2026" / "Awaiting results" - shown in place of the record
	// and points while nothing has settled.
	pendingLabel: string
}

export function buildBallotShareCard(data: BallotShareCardData): SatoriNode {
	const hasSettled = data.wins + data.losses > 0
	const ballotName = clamp(data.ballotName, NAME_MAX)

	const cells: SatoriNode[] = [
		statCell("Called", `${data.calledCount} of ${data.memberCount}`),
	]
	if (hasSettled) {
		const up = data.points >= 0
		cells.push(statCell("Record", `${data.wins}–${data.losses}`))
		cells.push(
			statCell("Points", `${up ? "+" : "−"}${Math.abs(data.points)}`, {
				color: up ? COLOR.success : COLOR.danger,
				big: true,
			}),
		)
	} else {
		cells.push(statCell("Status", data.pendingLabel, { color: COLOR.dim }))
	}

	return el(
		"div",
		{
			display: "flex",
			width: `${TARGET_WIDTH}px`,
			height: `${TARGET_HEIGHT}px`,
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
					border: `1px solid ${COLOR.border}`,
					borderRadius: "20px",
				},
				[
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
						[
							brandWordmark(wordmarkPx, WORDMARK_SCALE),
							eyebrow(`${data.leagueAbbr} · Ballot`),
						],
					),
					el(
						"div",
						{
							display: "flex",
							flexDirection: "column",
							flex: "1",
							overflow: "hidden",
							alignItems: "center",
							justifyContent: "center",
							gap: "10px",
							paddingLeft: "48px",
							paddingRight: "48px",
						},
						[
							eyebrow(
								`${clamp(data.name, PERSON_MAX)}'s picks`,
								COLOR.primaryDefault,
							),
							el(
								"span",
								{
									display: "flex",
									fontFamily: "Archivo Black",
									fontSize: ballotName.length <= NAME_HERO_MAX ? "68px" : "44px",
									lineHeight: 1.1,
									textAlign: "center",
									color: COLOR.ink,
								},
								ballotName,
							),
						],
					),
					el(
						"div",
						{
							display: "flex",
							flexDirection: "column",
							height: `${FOOTER_HEIGHT}px`,
							flexShrink: 0,
							justifyContent: "center",
							gap: "18px",
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
								[
									el("span", { display: "flex" }, `@${data.username}`),
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
