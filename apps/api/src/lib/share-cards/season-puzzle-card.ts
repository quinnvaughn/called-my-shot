// Name That Season's og:images. A result
// (/arcade/name-that-season/:date/:result) is squares, the way it's shared
// in a group chat. On the day it shows nothing that could give the answer
// away beyond the league everyone plays in: the left panel wears the game's
// own color, never the team's. Once the day is over it names the season.
// Today's card (/arcade/name-that-season) is the first clue.

import { seasonResultLine } from "@called-my-shot/schemas"
import { db } from "../../db"
import { arcadeDay, isArcadeDay } from "../arcade/day"
import { COLOR } from "../brand-palette"
import { findSeasonPuzzleForDay, verifiedSharer } from "../season-puzzles/load"
import {
	parseSeasonSquaresCode,
	SEASON_PUZZLE_MAX_GUESSES,
	type SeasonGuessOutcome,
} from "../season-puzzles/play"
import { el, image, type SatoriNode } from "../share-image"
import {
	type ArcadePanel,
	arcadeCard,
	arcadeHeadline,
	arcadeSubline,
} from "./arcade-frame"
import { clamp, eyebrow } from "./frame"
import { logoDataUri } from "./team-logo"

const SQUARE_PX = 92
const LOGO_PX = 56
const SEASON_NAME_MAX = 36
const SHARER_MAX = 24
const FIRST_CLUE_MAX = 90
const TODAY_HEADLINE_PX = 48

// Today's puzzle as /arcade/name-that-season previews it: the first clue,
// which anyone opening the game sees before guessing anyway.
export type SeasonTodayCardData = {
	day: string
	league: string
	firstClue: string
}

export type SeasonPuzzleCardData = {
	day: string
	// "NFL": the league is shown with the puzzle, so it's on the card too.
	league: string
	// One per guess, in order.
	squares: SeasonGuessOutcome[]
	// Whose result it is, when the link named them and it's really theirs.
	sharer: string | null
	// Only once the day is over. `name` is the season, "2007 New England
	// Patriots".
	team: { name: string; logo: string | null; color: string } | null
}

function square(fill: SeasonGuessOutcome | "unused"): SatoriNode {
	const style = {
		hit: {
			backgroundColor: COLOR.success,
			border: `2px solid ${COLOR.success}`,
		},
		close: {
			backgroundColor: COLOR.caution,
			border: `2px solid ${COLOR.caution}`,
		},
		miss: {
			backgroundColor: COLOR.danger,
			border: `2px solid ${COLOR.danger}`,
		},
		unused: {
			backgroundColor: COLOR.cardMuted,
			border: `2px solid ${COLOR.borderEmphasized}`,
		},
	}[fill]
	return el(
		"div",
		{
			display: "flex",
			width: `${SQUARE_PX}px`,
			height: `${SQUARE_PX}px`,
			borderRadius: "16px",
			...style,
		},
		[],
	)
}

function squares(outcomes: SeasonGuessOutcome[]): SatoriNode[] {
	return Array.from({ length: SEASON_PUZZLE_MAX_GUESSES }, (_, i) =>
		square(outcomes[i] ?? "unused"),
	)
}

function teamLine(team: NonNullable<SeasonPuzzleCardData["team"]>): SatoriNode {
	const mark = team.logo
		? image(team.logo, LOGO_PX, LOGO_PX, { objectFit: "contain" })
		: el(
				"div",
				{
					display: "flex",
					width: `${LOGO_PX}px`,
					height: `${LOGO_PX}px`,
					borderRadius: "12px",
					backgroundColor: team.color,
				},
				[],
			)
	return el("div", { display: "flex", alignItems: "center", gap: "18px" }, [
		mark,
		el(
			"span",
			{
				display: "flex",
				fontFamily: "Inter",
				fontWeight: 600,
				fontSize: "32px",
				color: COLOR.linen,
			},
			`It was the ${clamp(team.name, SEASON_NAME_MAX)}`,
		),
	])
}

function panel(day: string, league: string): ArcadePanel {
	return {
		color: COLOR.season,
		title: ["NAME", "THAT", "SEASON"],
		rule: "Name the team and year from six clues.",
		day,
		league,
	}
}

export function buildSeasonPuzzleCard(data: SeasonPuzzleCardData): SatoriNode {
	const solved = data.squares.at(-1) === "hit"
	const result = !solved
		? "MISSED IT"
		: data.squares.length === 1
			? "FIRST GUESS"
			: `GOT IT IN ${data.squares.length}`
	return arcadeCard(
		panel(data.day, data.league),
		eyebrow(
			data.sharer
				? `@${clamp(data.sharer, SHARER_MAX)} played it`
				: "Which season is this?",
		),
		el("div", { display: "flex", flexDirection: "column", gap: "30px" }, [
			el("div", { display: "flex", gap: "14px" }, squares(data.squares)),
			el("div", { display: "flex", flexDirection: "column", gap: "10px" }, [
				arcadeHeadline(result),
				arcadeSubline(seasonResultLine(solved ? data.squares.length : null)),
			]),
			...(data.team ? [teamLine(data.team)] : []),
		]),
	)
}

export function buildSeasonTodayCard(data: SeasonTodayCardData): SatoriNode {
	return arcadeCard(
		panel(data.day, data.league),
		eyebrow("Today's season"),
		el("div", { display: "flex", flexDirection: "column", gap: "30px" }, [
			el("div", { display: "flex", gap: "14px" }, squares([])),
			el("div", { display: "flex", flexDirection: "column", gap: "10px" }, [
				arcadeHeadline("CAN YOU NAME IT?", TODAY_HEADLINE_PX),
				arcadeSubline(clamp(`Clue 1: ${data.firstClue}`, FIRST_CLUE_MAX)),
			]),
		]),
	)
}

// `result` is the game's squares as the share link carries them, "ryyg"
// (see seasonSquaresCode). Null for a day with no puzzle, one still to come,
// or squares no finished game could have.
// `by` is the username the link names, kept only if it's really their result.
export async function loadSeasonPuzzleCardData(
	day: string,
	result: string,
	by?: string,
): Promise<SeasonPuzzleCardData | null> {
	if (!isArcadeDay(day)) return null
	const outcomes = parseSeasonSquaresCode(result)
	if (!outcomes) return null
	const today = arcadeDay(new Date())
	if (day > today) return null
	const puzzle = await findSeasonPuzzleForDay(day)
	if (!puzzle) return null
	const [league, team] = await Promise.all([
		db.query.leagues.findFirst({ where: { id: puzzle.teamSeason.leagueId } }),
		db.query.teams.findFirst({ where: { id: puzzle.teamSeason.teamId } }),
	])
	if (!league || !team) return null
	const sharer = by ? await verifiedSharer(puzzle, by, result) : null
	return {
		day,
		league: league.abbreviation,
		squares: outcomes,
		sharer: sharer?.username ?? null,
		team:
			day < today
				? {
						name: `${puzzle.teamSeason.label} ${puzzle.teamSeason.name}`,
						color: team.color,
						logo: await logoDataUri(team.logoUrl),
					}
				: null,
	}
}

// Null for a day with no puzzle or one still to come.
export async function loadSeasonTodayCardData(
	day: string,
): Promise<SeasonTodayCardData | null> {
	if (!isArcadeDay(day) || day > arcadeDay(new Date())) return null
	const puzzle = await findSeasonPuzzleForDay(day)
	const firstClue = puzzle?.clues[0]
	if (!puzzle || !firstClue) return null
	const league = await db.query.leagues.findFirst({
		where: { id: puzzle.teamSeason.leagueId },
	})
	if (!league) return null
	return { day, league: league.abbreviation, firstClue }
}
