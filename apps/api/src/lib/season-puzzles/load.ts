import { and, eq, gte, inArray, isNotNull, lte, or } from "drizzle-orm"
import { db } from "../../db"
import {
	type SeasonGuessInput,
	type SeasonPuzzle,
	seasonPuzzleResults,
	seasonPuzzles,
	type Team,
	type TeamSeason,
	teamSeasons,
	teams,
} from "../../db/schema"
import {
	type ArchivedSeasons,
	evaluateSeasonGuesses,
	type SeasonPlayState,
	type SeasonPuzzleAnswer,
	seasonGuessCount,
	seasonKey,
	seasonSquaresCode,
} from "./play"
import type { FinishedSeasonGame } from "./stats"

// A scheduled puzzle with the team-season that's its answer.
export type LoadedSeasonPuzzle = SeasonPuzzle & { teamSeason: TeamSeason }

export async function findSeasonPuzzleForDay(
	day: string,
): Promise<LoadedSeasonPuzzle | null> {
	return (
		(await db.query.seasonPuzzles.findFirst({
			where: { playDate: day },
			with: { teamSeason: true },
		})) ?? null
	)
}

export async function findSeasonPuzzle(
	id: string,
): Promise<LoadedSeasonPuzzle | null> {
	return (
		(await db.query.seasonPuzzles.findFirst({
			where: { id },
			with: { teamSeason: true },
		})) ?? null
	)
}

export function seasonPuzzleAnswer(
	puzzle: LoadedSeasonPuzzle,
): SeasonPuzzleAnswer {
	return {
		teamId: puzzle.teamSeason.teamId,
		year: puzzle.teamSeason.year,
		clues: puzzle.clues,
	}
}

// Every franchise-season a guess can name in one league.
export async function archivedSeasons(
	leagueId: string,
): Promise<ArchivedSeasons> {
	const rows = await db
		.select({ teamId: teamSeasons.teamId, year: teamSeasons.year })
		.from(teamSeasons)
		.where(eq(teamSeasons.leagueId, leagueId))
	return new Set(rows.map(seasonKey))
}

export async function loadTeamSeasonsFor(
	guesses: readonly SeasonGuessInput[],
): Promise<Map<string, TeamSeason>> {
	if (guesses.length === 0) return new Map()
	const rows = await db
		.select()
		.from(teamSeasons)
		.where(
			or(
				...guesses.map((g) =>
					and(eq(teamSeasons.teamId, g.teamId), eq(teamSeasons.year, g.year)),
				),
			),
		)
	return new Map(rows.map((row) => [seasonKey(row), row]))
}

// A game's state with the rows it mentions, so the GraphQL layer can hand
// back whole teams and seasons without a lookup per guess.
export type SeasonPlayView = {
	puzzle: LoadedSeasonPuzzle
	state: SeasonPlayState
	teamsById: Map<string, Team>
	seasonsByKey: Map<string, TeamSeason>
}

export async function loadSeasonPlayView(
	puzzle: LoadedSeasonPuzzle,
	guesses: readonly SeasonGuessInput[],
): Promise<SeasonPlayView> {
	const state = evaluateSeasonGuesses(seasonPuzzleAnswer(puzzle), guesses)
	const teamIds = [
		...new Set([...guesses.map((g) => g.teamId), puzzle.teamSeason.teamId]),
	]
	const [teamRows, seasonsByKey] = await Promise.all([
		db.select().from(teams).where(inArray(teams.id, teamIds)),
		loadTeamSeasonsFor(guesses),
	])
	return {
		puzzle,
		state,
		teamsById: new Map(teamRows.map((t) => [t.id, t])),
		seasonsByKey,
	}
}

const resultColumns = {
	day: seasonPuzzles.playDate,
	clues: seasonPuzzles.clues,
	teamId: teamSeasons.teamId,
	year: teamSeasons.year,
}

// Every finished game a player has, for their stats.
export async function loadFinishedSeasonGames(
	userId: string,
): Promise<FinishedSeasonGame[]> {
	const rows = await db
		.select({ ...resultColumns, guesses: seasonPuzzleResults.guesses })
		.from(seasonPuzzleResults)
		.innerJoin(
			seasonPuzzles,
			eq(seasonPuzzles.id, seasonPuzzleResults.puzzleId),
		)
		.innerJoin(teamSeasons, eq(teamSeasons.id, seasonPuzzles.teamSeasonId))
		.where(
			and(
				eq(seasonPuzzleResults.userId, userId),
				isNotNull(seasonPuzzleResults.finishedAt),
			),
		)
	return rows.map((row) => ({
		day: row.day,
		guessCount: seasonGuessCount(evaluateSeasonGuesses(row, row.guesses)),
	}))
}

// The puzzles that ran between two days, inclusive, with every result on
// them from `userIds`.
export async function loadSeasonResultsBetween(
	fromDay: string,
	toDay: string,
	userIds: string[],
) {
	if (userIds.length === 0) return []
	return db
		.select({
			...resultColumns,
			userId: seasonPuzzleResults.userId,
			guesses: seasonPuzzleResults.guesses,
		})
		.from(seasonPuzzleResults)
		.innerJoin(
			seasonPuzzles,
			eq(seasonPuzzles.id, seasonPuzzleResults.puzzleId),
		)
		.innerJoin(teamSeasons, eq(teamSeasons.id, seasonPuzzles.teamSeasonId))
		.where(
			and(
				gte(seasonPuzzles.playDate, fromDay),
				lte(seasonPuzzles.playDate, toDay),
				inArray(seasonPuzzleResults.userId, userIds),
			),
		)
}

// The player a shared link names (its ?by=), only when their own finished
// game on the puzzle has the link's squares. A link can put any name and any
// squares in its url, so anything else is nobody's.
export async function verifiedSharer(
	puzzle: LoadedSeasonPuzzle,
	username: string,
	squaresCode: string,
) {
	const user = await db.query.users.findFirst({ where: { username } })
	if (!user) return null
	const result = await db.query.seasonPuzzleResults.findFirst({
		where: { puzzleId: puzzle.id, userId: user.id },
	})
	if (!result?.finishedAt) return null
	const state = evaluateSeasonGuesses(
		seasonPuzzleAnswer(puzzle),
		result.guesses,
	)
	return seasonSquaresCode(state) === squaresCode.toLowerCase() ? user : null
}
