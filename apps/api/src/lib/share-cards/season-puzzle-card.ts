// The og:image behind /play/name-that-season/:date/:result: a Name That
// Season result as squares, the way it's shared in a group chat. On the day
// it shows nothing that could give the answer away beyond the league
// everyone plays in: the left panel wears the game's own color, never the
// team's. Once the day is over it names the season.

import { SPORTS_TIME_ZONE, seasonResultLine } from "@called-my-shot/schemas"
import { DateTime } from "luxon"
import { db } from "../../db"
import { COLOR } from "../brand-palette"
import { isSeasonPuzzleDay, seasonPuzzleDay } from "../season-puzzles/day"
import { findSeasonPuzzleForDay, verifiedSharer } from "../season-puzzles/load"
import {
	parseSeasonSquaresCode,
	SEASON_PUZZLE_MAX_GUESSES,
	type SeasonGuessOutcome,
} from "../season-puzzles/play"
import { el, image, type SatoriNode } from "../share-image"
import { brandWordmark } from "./brand-wordmark"
import { clamp, eyebrow, SHARE_CARD_SIZE } from "./frame"
import { logoDataUri } from "./team-logo"

const SQUARE_PX = 92
const LOGO_PX = 56
const SEASON_NAME_MAX = 36
const SHARER_MAX = 24
const WORDMARK_SCALE = 1.4

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

export function buildSeasonPuzzleCard(data: SeasonPuzzleCardData): SatoriNode {
	const dateLabel = DateTime.fromISO(data.day, { zone: SPORTS_TIME_ZONE })
		.toFormat("LLL d")
		.toUpperCase()
	const solved = data.squares.at(-1) === "hit"
	const result = !solved
		? "MISSED IT"
		: data.squares.length === 1
			? "FIRST GUESS"
			: `GOT IT IN ${data.squares.length}`

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
							backgroundColor: COLOR.season,
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
											el("span", { display: "flex" }, "NAME"),
											el("span", { display: "flex" }, "THAT"),
											el("span", { display: "flex" }, "SEASON"),
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
										"Name the team and year from six clues.",
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
							eyebrow(
								data.sharer
									? `@${clamp(data.sharer, SHARER_MAX)} played it`
									: "Which season is this?",
							),
							el(
								"div",
								{ display: "flex", flexDirection: "column", gap: "30px" },
								[
									el(
										"div",
										{ display: "flex", gap: "14px" },
										squares(data.squares),
									),
									el(
										"div",
										{ display: "flex", flexDirection: "column", gap: "10px" },
										[
											el(
												"span",
												{
													display: "flex",
													fontFamily: "Archivo Black",
													fontSize: "64px",
													color: COLOR.ink,
												},
												result,
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
												seasonResultLine(solved ? data.squares.length : null),
											),
										],
									),
									...(data.team ? [teamLine(data.team)] : []),
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

// `result` is the game's squares as the share link carries them, "ryyg"
// (see seasonSquaresCode). Null for a day with no puzzle, one still to come,
// or squares no finished game could have.
// `by` is the username the link names, kept only if it's really their result.
export async function loadSeasonPuzzleCardData(
	day: string,
	result: string,
	by?: string,
): Promise<SeasonPuzzleCardData | null> {
	if (!isSeasonPuzzleDay(day)) return null
	const outcomes = parseSeasonSquaresCode(result)
	if (!outcomes) return null
	const today = seasonPuzzleDay(new Date())
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
