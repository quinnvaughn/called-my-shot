// Blind Rank's og:images. A result (/arcade/blind-rank/:date/:result) is
// five squares, one per slot from the top: on the day it shows what was
// ranked but none of the five, and once the day is over it names who was
// first. Today's card (/arcade/blind-rank) is the prompt and the first of
// the five, which anyone opening the game sees first anyway.

import { rankResultHeadline, rankResultLine } from "@called-my-shot/schemas"
import { db } from "../../db"
import { arcadeDay, isArcadeDay } from "../arcade/day"
import { findRankPuzzleForDay, verifiedRankSharer } from "../blind-rank/load"
import { parseRankSquaresCode, trueSlotsOf } from "../blind-rank/play"
import { COLOR } from "../brand-palette"
import { el, type SatoriNode } from "../share-image"
import {
	type ArcadePanel,
	arcadeCard,
	arcadeHeadline,
	arcadeSubline,
	emptySquare,
} from "./arcade-frame"
import { clamp, eyebrow } from "./frame"

const SQUARE_PX = 92
const PROMPT_MAX = 40
const TOP_MAX = 44
const FIRST_UP_MAX = 34
const SHARER_MAX = 24
const SLOTS = 5
const TODAY_HEADLINE_PX = 48

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

export type BlindRankTodayCardData = {
	day: string
	league: string
	prompt: string
	// The first of the five to place.
	firstUp: string
}

function panel(day: string, league: string): ArcadePanel {
	return {
		color: COLOR.rank,
		title: ["BLIND", "RANK"],
		rule: "Rank five, one at a time. No moving them.",
		day,
		league,
	}
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

function promptBlock(label: string, prompt: string): SatoriNode {
	return el("div", { display: "flex", flexDirection: "column", gap: "10px" }, [
		eyebrow(label),
		el(
			"span",
			{
				display: "flex",
				fontFamily: "Inter",
				fontWeight: 700,
				fontSize: "30px",
				color: COLOR.ink,
			},
			clamp(prompt, PROMPT_MAX),
		),
	])
}

function squaresAndLines(
	row: SatoriNode[],
	headline: SatoriNode,
	line: string,
): SatoriNode {
	return el("div", { display: "flex", flexDirection: "column", gap: "24px" }, [
		el("div", { display: "flex", gap: "14px" }, row),
		el("div", { display: "flex", flexDirection: "column", gap: "8px" }, [
			headline,
			arcadeSubline(line),
		]),
	])
}

export function buildBlindRankCard(data: BlindRankCardData): SatoriNode {
	const correct = data.squares.filter(Boolean).length
	return arcadeCard(
		panel(data.day, data.league),
		promptBlock(
			data.sharer
				? `@${clamp(data.sharer, SHARER_MAX)} played it`
				: "Rank them",
			data.prompt,
		),
		squaresAndLines(
			data.squares.map(square),
			arcadeHeadline(rankResultHeadline(correct).toUpperCase()),
			data.top
				? clamp(`No. 1 was ${data.top.label} (${data.top.display})`, TOP_MAX)
				: rankResultLine(correct),
		),
	)
}

export function buildBlindRankTodayCard(
	data: BlindRankTodayCardData,
): SatoriNode {
	return arcadeCard(
		panel(data.day, data.league),
		promptBlock("Today's ranking", data.prompt),
		squaresAndLines(
			Array.from({ length: SLOTS }, () => emptySquare(SQUARE_PX)),
			arcadeHeadline("CAN YOU RANK THEM?", TODAY_HEADLINE_PX),
			clamp(`First up: ${data.firstUp}`, FIRST_UP_MAX),
		),
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

// Null for a day with no puzzle or one still to come.
export async function loadBlindRankTodayCardData(
	day: string,
): Promise<BlindRankTodayCardData | null> {
	if (!isArcadeDay(day) || day > arcadeDay(new Date())) return null
	const puzzle = await findRankPuzzleForDay(day)
	const firstUp = puzzle?.items[0]
	if (!puzzle || !firstUp) return null
	const league = await db.query.leagues.findFirst({
		where: { id: puzzle.leagueId },
	})
	if (!league) return null
	return {
		day,
		league: league.abbreviation,
		prompt: `${puzzle.prompt} · ${puzzle.context}`,
		firstUp: firstUp.label,
	}
}
