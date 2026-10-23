// The og:image behind /play/blind-rank/:date/:result: a Blind Rank result as
// five squares, one per slot from the top. On the day it shows what was
// ranked but none of the five; once the day is over it names who was first.

import {
	rankResultHeadline,
	rankResultLine,
	SPORTS_TIME_ZONE,
} from "@called-my-shot/schemas"
import { DateTime } from "luxon"
import { db } from "../../db"
import { arcadeDay, isArcadeDay } from "../arcade/day"
import { findRankPuzzleForDay, verifiedRankSharer } from "../blind-rank/load"
import { parseRankSquaresCode, trueSlotsOf } from "../blind-rank/play"
import { COLOR } from "../brand-palette"
import { el, type SatoriNode } from "../share-image"
import { brandWordmark } from "./brand-wordmark"
import { clamp, eyebrow, SHARE_CARD_SIZE } from "./frame"

const SQUARE_PX = 92
const PROMPT_MAX = 40
const TOP_MAX = 44
const SHARER_MAX = 24
const WORDMARK_SCALE = 1.4

export type BlindRankCardData = {
	day: string
	league: string
	// "Career points · NBA".
	prompt: string
	// One per slot from the top: whether it was right.
	squares: boolean[]
	sharer: string | null
	// Only once the day is over: who was first, and their value.
	top: { label: string; display: string } | null
}

function square(right: boolean): SatoriNode {
	const fill = right ? COLOR.success : COLOR.danger
	return el(
		"div",
		{
			display: "flex",
			width: `${SQUARE_PX}px`,
			height: `${SQUARE_PX}px`,
			borderRadius: "16px",
			backgroundColor: fill,
			border: `2px solid ${fill}`,
		},
		[],
	)
}

export function buildBlindRankCard(data: BlindRankCardData): SatoriNode {
	const dateLabel = DateTime.fromISO(data.day, { zone: SPORTS_TIME_ZONE })
		.toFormat("LLL d")
		.toUpperCase()
	const correct = data.squares.filter(Boolean).length

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
					// The game's panel: what game, how it's played, and which day.
					el(
						"div",
						{
							display: "flex",
							flexDirection: "column",
							justifyContent: "space-between",
							width: "400px",
							padding: "44px 40px",
							backgroundColor: COLOR.rank,
							color: COLOR.ink,
						},
						[
							el(
								"div",
								{ display: "flex", flexDirection: "column", gap: "22px" },
								[
									el(
										"div",
										{
											display: "flex",
											flexDirection: "column",
											fontFamily: "Archivo Black",
											fontSize: "72px",
											lineHeight: 0.95,
										},
										[
											el("span", { display: "flex" }, "BLIND"),
											el("span", { display: "flex" }, "RANK"),
										],
									),
									// The whole rule, for someone who's never played.
									el(
										"span",
										{
											display: "flex",
											fontFamily: "Inter",
											fontWeight: 600,
											fontSize: "24px",
											lineHeight: 1.3,
										},
										"Rank five, one at a time. No moving them.",
									),
								],
							),
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
									el("span", { display: "flex" }, dateLabel),
									el("span", { display: "flex" }, data.league),
								],
							),
						],
					),
					// The result.
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
							el(
								"div",
								{ display: "flex", flexDirection: "column", gap: "10px" },
								[
									eyebrow(
										data.sharer
											? `@${clamp(data.sharer, SHARER_MAX)} played it`
											: "Rank them",
									),
									el(
										"span",
										{
											display: "flex",
											fontFamily: "Inter",
											fontWeight: 700,
											fontSize: "30px",
											color: COLOR.ink,
										},
										clamp(data.prompt, PROMPT_MAX),
									),
								],
							),
							el(
								"div",
								{ display: "flex", flexDirection: "column", gap: "24px" },
								[
									el(
										"div",
										{ display: "flex", gap: "14px" },
										data.squares.map(square),
									),
									el(
										"div",
										{ display: "flex", flexDirection: "column", gap: "8px" },
										[
											el(
												"span",
												{
													display: "flex",
													fontFamily: "Archivo Black",
													fontSize: "64px",
													color: COLOR.ink,
												},
												rankResultHeadline(correct).toUpperCase(),
											),
											el(
												"span",
												{
													display: "flex",
													fontFamily: "Inter",
													fontWeight: 600,
													fontSize: "28px",
													color: COLOR.linen,
												},
												data.top
													? clamp(
															`No. 1 was ${data.top.label} (${data.top.display})`,
															TOP_MAX,
														)
													: rankResultLine(correct),
											),
										],
									),
								],
							),
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

// `result` is the squares as the share link carries them, "ggrgr". Null for
// a day with no puzzle, one still to come, or squares no finished game could
// have. `by` is the username the link names, kept only if it's really theirs.
export async function loadBlindRankCardData(
	day: string,
	result: string,
	by?: string,
): Promise<BlindRankCardData | null> {
	if (!isArcadeDay(day)) return null
	const squares = parseRankSquaresCode(result)
	if (!squares) return null
	const today = arcadeDay(new Date())
	if (day > today) return null
	const puzzle = await findRankPuzzleForDay(day)
	if (!puzzle) return null
	const league = await db.query.leagues.findFirst({
		where: { id: puzzle.leagueId },
	})
	if (!league) return null
	const sharer = by ? await verifiedRankSharer(puzzle, by, result) : null
	const slots = trueSlotsOf(puzzle.items)
	const first = puzzle.items[slots.indexOf(0)]
	return {
		day,
		league: league.abbreviation,
		prompt: `${puzzle.prompt} · ${puzzle.context}`,
		squares,
		sharer: sharer?.username ?? null,
		top:
			day < today && first
				? { label: first.label, display: first.display }
				: null,
	}
}
