import { and, eq, sql } from "drizzle-orm"
import { db } from "../../../db"
import {
	type SeasonGuessInput,
	seasonPuzzleResults,
	teamSeasons,
} from "../../../db/schema"
import { requireUser } from "../../../lib/auth"
import {
	AuthenticationError,
	NotFoundError,
	ValidationError,
} from "../../../lib/errors"
import {
	isSeasonPuzzleDay,
	seasonPuzzleDay,
} from "../../../lib/season-puzzles/day"
import {
	archivedSeasons,
	findSeasonPuzzle,
	findSeasonPuzzleForDay,
	type LoadedSeasonPuzzle,
	loadFinishedSeasonGames,
	loadSeasonPlayView,
	seasonPuzzleAnswer,
} from "../../../lib/season-puzzles/load"
import {
	evaluateSeasonGuesses,
	legalSeasonGuesses,
	refuseSeasonGuess,
	type SeasonGuessRefusal,
} from "../../../lib/season-puzzles/play"
import { fillSeasonSchedule } from "../../../lib/season-puzzles/schedule"
import { seasonStats } from "../../../lib/season-puzzles/stats"
import { builder } from "../../builder"
import {
	type FranchiseOption,
	FranchiseOptionRef,
	SeasonGuessInputRef,
	SeasonPlayRef,
	SeasonPuzzleRef,
	SeasonShareRef,
	SeasonStatsRef,
} from "./refs"

// Today's puzzle by id, the only one that can be played. Anything else, a
// puzzle from yesterday included, is over.
async function playableSeasonPuzzle(
	puzzleId: string,
): Promise<LoadedSeasonPuzzle> {
	const puzzle = await findSeasonPuzzle(puzzleId)
	if (!puzzle || puzzle.playDate !== seasonPuzzleDay(new Date())) {
		throw new NotFoundError("That puzzle isn't today's")
	}
	return puzzle
}

const REFUSAL_MESSAGES: Record<SeasonGuessRefusal, string> = {
	finished: "Today's game is already over.",
	repeat: "You already guessed that season.",
	unknown_season: "Pick a team and season from the list.",
}

const toGuesses = (raw: readonly { teamId: string | number; year: number }[]) =>
	raw.map((g): SeasonGuessInput => ({ teamId: String(g.teamId), year: g.year }))

builder.objectField(SeasonPuzzleRef, "viewerPlay", (t) =>
	t.field({
		type: SeasonPlayRef,
		nullable: true,
		description: "The signed-in viewer's game on this puzzle.",
		resolve: async (puzzle, _args, ctx) => {
			if (!ctx.user) return null
			const result = await db.query.seasonPuzzleResults.findFirst({
				where: { puzzleId: puzzle.id, userId: ctx.user.id },
			})
			return loadSeasonPlayView(puzzle, result?.guesses ?? [])
		},
	}),
)

builder.queryFields((t) => ({
	// Null only when nothing is scheduled and the archive has nothing left
	// to schedule. A day the daily fill hasn't reached yet is filled here,
	// on the first visit.
	seasonPuzzleToday: t.field({
		type: SeasonPuzzleRef,
		nullable: true,
		resolve: async () => {
			const today = seasonPuzzleDay(new Date())
			const found = await findSeasonPuzzleForDay(today)
			if (found) return found
			try {
				await fillSeasonSchedule()
			} catch {
				// Two first visits filling at once: the unique day index turns
				// one away, and the other's fill is the one read below.
			}
			return findSeasonPuzzleForDay(today)
		},
	}),

	// Every franchise in a league with the seasons a guess can name.
	seasonGuessOptions: t.field({
		type: [FranchiseOptionRef],
		args: { leagueId: t.arg.id({ required: true }) },
		resolve: async (_root, args): Promise<FranchiseOption[]> => {
			const leagueId = String(args.leagueId)
			const [teamRows, seasons] = await Promise.all([
				db.query.teams.findMany({ where: { leagueId } }),
				db
					.select({
						teamId: teamSeasons.teamId,
						year: teamSeasons.year,
						label: teamSeasons.label,
						name: teamSeasons.name,
					})
					.from(teamSeasons)
					.where(eq(teamSeasons.leagueId, leagueId))
					.orderBy(teamSeasons.year),
			])
			return teamRows
				.map((team) => {
					const own = seasons.filter((s) => s.teamId === team.id)
					return {
						team,
						seasons: own.map(({ year, label }) => ({ year, label })),
						formerNames: [...new Set(own.map((s) => s.name))].filter(
							(name) => name !== team.name,
						),
					}
				})
				.filter((f) => f.seasons.length > 0)
				.sort((a, b) => a.team.name.localeCompare(b.team.name))
		},
	}),

	// A signed-out player's game, held in their browser. Stateless: the
	// guesses passed in are checked and evaluated, nothing is stored.
	seasonPuzzleGuestPlay: t.field({
		type: SeasonPlayRef,
		errors: {
			types: [NotFoundError],
			directResult: true,
			union: { name: "SeasonPuzzleGuestPlayResult" },
		},
		args: {
			puzzleId: t.arg.id({ required: true }),
			guesses: t.arg({ type: [SeasonGuessInputRef], required: true }),
		},
		resolve: async (_root, args) => {
			const puzzle = await playableSeasonPuzzle(String(args.puzzleId))
			const guesses = legalSeasonGuesses(
				seasonPuzzleAnswer(puzzle),
				toGuesses(args.guesses),
				await archivedSeasons(puzzle.teamSeason.leagueId),
			)
			return loadSeasonPlayView(puzzle, guesses)
		},
	}),

	// What a shared result link shows. Null for a day with no puzzle, or one
	// that hasn't come yet.
	seasonPuzzleShare: t.field({
		type: SeasonShareRef,
		nullable: true,
		args: { date: t.arg.string({ required: true }) },
		resolve: async (_root, args) => {
			if (!isSeasonPuzzleDay(args.date)) return null
			const today = seasonPuzzleDay(new Date())
			if (args.date > today) return null
			const puzzle = await findSeasonPuzzleForDay(args.date)
			if (!puzzle) return null
			return { puzzle, revealed: args.date < today }
		},
	}),

	// Null for a signed-out viewer, whose games aren't kept.
	viewerSeasonPuzzleStats: t.field({
		type: SeasonStatsRef,
		nullable: true,
		resolve: async (_root, _args, ctx) => {
			if (!ctx.user) return null
			return seasonStats(
				await loadFinishedSeasonGames(ctx.user.id),
				seasonPuzzleDay(new Date()),
			)
		},
	}),
}))

builder.mutationFields((t) => ({
	guessSeason: t.field({
		type: SeasonPlayRef,
		errors: {
			types: [AuthenticationError, NotFoundError, ValidationError],
			directResult: true,
			union: { name: "GuessSeasonResult" },
		},
		args: {
			puzzleId: t.arg.id({ required: true }),
			teamId: t.arg.id({ required: true }),
			year: t.arg.int({ required: true }),
		},
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const puzzle = await playableSeasonPuzzle(String(args.puzzleId))
			const answer = seasonPuzzleAnswer(puzzle)
			const guess = { teamId: String(args.teamId), year: args.year }
			const archived = await archivedSeasons(puzzle.teamSeason.leagueId)

			const guesses = await db.transaction(async (tx) => {
				await tx
					.insert(seasonPuzzleResults)
					.values({ puzzleId: puzzle.id, userId: user.id })
					.onConflictDoNothing()
				const [row] = await tx
					.select()
					.from(seasonPuzzleResults)
					.where(
						and(
							eq(seasonPuzzleResults.puzzleId, puzzle.id),
							eq(seasonPuzzleResults.userId, user.id),
						),
					)
					.for("update")
				if (!row) throw new Error("guessSeason: result row vanished")
				const refusal = refuseSeasonGuess(answer, row.guesses, guess, archived)
				if (refusal) {
					throw ValidationError.field("year", REFUSAL_MESSAGES[refusal])
				}
				const next = [...row.guesses, guess]
				const over = evaluateSeasonGuesses(answer, next).over
				await tx
					.update(seasonPuzzleResults)
					.set({ guesses: next, finishedAt: over ? new Date() : null })
					.where(eq(seasonPuzzleResults.id, row.id))
				return next
			})
			return loadSeasonPlayView(puzzle, guesses)
		},
	}),

	// Saves the game a player finished, or got partway through, before
	// they had an account. Only today's, and only if the account has no
	// game on it yet: an account that already played keeps its own.
	importSeasonGuesses: t.field({
		type: SeasonPlayRef,
		errors: {
			types: [AuthenticationError, NotFoundError],
			directResult: true,
			union: { name: "ImportSeasonGuessesResult" },
		},
		args: {
			puzzleId: t.arg.id({ required: true }),
			guesses: t.arg({ type: [SeasonGuessInputRef], required: true }),
		},
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const puzzle = await playableSeasonPuzzle(String(args.puzzleId))
			const answer = seasonPuzzleAnswer(puzzle)
			const guesses = legalSeasonGuesses(
				answer,
				toGuesses(args.guesses),
				await archivedSeasons(puzzle.teamSeason.leagueId),
			)
			const finishedAt = evaluateSeasonGuesses(answer, guesses).over
				? new Date()
				: null
			await db
				.insert(seasonPuzzleResults)
				.values({ puzzleId: puzzle.id, userId: user.id, guesses, finishedAt })
				.onConflictDoUpdate({
					target: [seasonPuzzleResults.puzzleId, seasonPuzzleResults.userId],
					set: { guesses, finishedAt },
					setWhere: sql`jsonb_array_length(${seasonPuzzleResults.guesses}) = 0`,
				})
			const saved = await db.query.seasonPuzzleResults.findFirst({
				where: { puzzleId: puzzle.id, userId: user.id },
			})
			return loadSeasonPlayView(puzzle, saved?.guesses ?? guesses)
		},
	}),
}))
