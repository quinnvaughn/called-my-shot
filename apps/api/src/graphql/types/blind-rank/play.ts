import { and, eq, sql } from "drizzle-orm"
import { db } from "../../../db"
import { type RankPuzzle, rankPuzzleResults } from "../../../db/schema"
import { arcadeDay, isArcadeDay } from "../../../lib/arcade/day"
import { requireUser } from "../../../lib/auth"
import {
	findRankPuzzle,
	findRankPuzzleForDay,
	loadFinishedRankGames,
	loadRankPlayView,
	loadRankTeams,
} from "../../../lib/blind-rank/load"
import {
	evaluateRankPlacements,
	legalRankPlacements,
	type RankPlacementRefusal,
	refuseRankPlacement,
} from "../../../lib/blind-rank/play"
import { fillRankSchedule } from "../../../lib/blind-rank/schedule"
import { rankStats } from "../../../lib/blind-rank/stats"
import {
	AuthenticationError,
	NotFoundError,
	ValidationError,
} from "../../../lib/errors"
import { builder } from "../../builder"
import { RankPlayRef, RankPuzzleRef, RankShareRef, RankStatsRef } from "./refs"

// Today's puzzle by id, the only one that can be played. `anyDay` lifts that
// for an admin's unsaved practice game.
async function playableRankPuzzle(
	puzzleId: string,
	{ anyDay = false } = {},
): Promise<RankPuzzle> {
	const puzzle = await findRankPuzzle(puzzleId)
	if (!puzzle || (!anyDay && puzzle.playDate !== arcadeDay(new Date()))) {
		throw new NotFoundError("That puzzle isn't today's")
	}
	return puzzle
}

const REFUSAL_MESSAGES: Record<RankPlacementRefusal, string> = {
	finished: "Today's game is already over.",
	invalid_slot: "Pick a slot from 1 to 5.",
	taken: "That slot's already taken.",
}

builder.objectField(RankPuzzleRef, "viewerPlay", (t) =>
	t.field({
		type: RankPlayRef,
		nullable: true,
		description: "The signed-in viewer's game on this puzzle.",
		resolve: async (puzzle, _args, ctx) => {
			if (!ctx.user) return null
			const result = await db.query.rankPuzzleResults.findFirst({
				where: { puzzleId: puzzle.id, userId: ctx.user.id },
			})
			return loadRankPlayView(puzzle, result?.placements ?? [])
		},
	}),
)

builder.queryFields((t) => ({
	// Null only when nothing is scheduled and the pools can't make a puzzle.
	// A day the daily fill hasn't reached yet is filled here, on the first
	// visit.
	rankPuzzleToday: t.field({
		type: RankPuzzleRef,
		nullable: true,
		resolve: async () => {
			const today = arcadeDay(new Date())
			const found = await findRankPuzzleForDay(today)
			if (found) return found
			try {
				await fillRankSchedule()
			} catch {
				// Two first visits filling at once: the unique day index turns
				// one away, and the other's fill is the one read below.
			}
			return findRankPuzzleForDay(today)
		},
	}),

	// A signed-out player's game, held in their browser. Stateless. Admins
	// can play any day's this way, as practice.
	rankPuzzleGuestPlay: t.field({
		type: RankPlayRef,
		errors: {
			types: [NotFoundError],
			directResult: true,
			union: { name: "RankPuzzleGuestPlayResult" },
		},
		args: {
			puzzleId: t.arg.id({ required: true }),
			placements: t.arg.intList({ required: true }),
		},
		resolve: async (_root, args, ctx) => {
			const puzzle = await playableRankPuzzle(String(args.puzzleId), {
				anyDay: ctx.user?.isAdmin === true,
			})
			return loadRankPlayView(
				puzzle,
				legalRankPlacements(puzzle.items, args.placements),
			)
		},
	}),

	// What a shared result link shows. Null for a day with no puzzle, or one
	// that hasn't come yet.
	rankPuzzleShare: t.field({
		type: RankShareRef,
		nullable: true,
		args: { date: t.arg.string({ required: true }) },
		resolve: async (_root, args) => {
			if (!isArcadeDay(args.date)) return null
			const today = arcadeDay(new Date())
			if (args.date > today) return null
			const puzzle = await findRankPuzzleForDay(args.date)
			if (!puzzle) return null
			return {
				puzzle,
				revealed: args.date < today,
				teamsById: await loadRankTeams(puzzle),
			}
		},
	}),

	viewerRankStats: t.field({
		type: RankStatsRef,
		nullable: true,
		resolve: async (_root, _args, ctx) => {
			if (!ctx.user) return null
			return rankStats(
				await loadFinishedRankGames(ctx.user.id),
				arcadeDay(new Date()),
			)
		},
	}),
}))

builder.mutationFields((t) => ({
	// Puts today's next item in `slot` (1 is the most).
	placeRank: t.field({
		type: RankPlayRef,
		errors: {
			types: [AuthenticationError, NotFoundError, ValidationError],
			directResult: true,
			union: { name: "PlaceRankResult" },
		},
		args: {
			puzzleId: t.arg.id({ required: true }),
			slot: t.arg.int({ required: true }),
		},
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const puzzle = await playableRankPuzzle(String(args.puzzleId))
			const slot = args.slot - 1

			const placements = await db.transaction(async (tx) => {
				await tx
					.insert(rankPuzzleResults)
					.values({ puzzleId: puzzle.id, userId: user.id })
					.onConflictDoNothing()
				const [row] = await tx
					.select()
					.from(rankPuzzleResults)
					.where(
						and(
							eq(rankPuzzleResults.puzzleId, puzzle.id),
							eq(rankPuzzleResults.userId, user.id),
						),
					)
					.for("update")
				if (!row) throw new Error("placeRank: result row vanished")
				const refusal = refuseRankPlacement(puzzle.items, row.placements, slot)
				if (refusal) {
					throw ValidationError.field("slot", REFUSAL_MESSAGES[refusal])
				}
				const next = [...row.placements, slot]
				const done = evaluateRankPlacements(puzzle.items, next).done
				await tx
					.update(rankPuzzleResults)
					.set({ placements: next, finishedAt: done ? new Date() : null })
					.where(eq(rankPuzzleResults.id, row.id))
				return next
			})
			return loadRankPlayView(puzzle, placements)
		},
	}),

	// Saves the game a player played before they had an account. Only
	// today's, and only if the account has no game on it yet.
	importRankPlacements: t.field({
		type: RankPlayRef,
		errors: {
			types: [AuthenticationError, NotFoundError],
			directResult: true,
			union: { name: "ImportRankPlacementsResult" },
		},
		args: {
			puzzleId: t.arg.id({ required: true }),
			placements: t.arg.intList({ required: true }),
		},
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const puzzle = await playableRankPuzzle(String(args.puzzleId))
			const placements = legalRankPlacements(puzzle.items, args.placements)
			const finishedAt = evaluateRankPlacements(puzzle.items, placements).done
				? new Date()
				: null
			await db
				.insert(rankPuzzleResults)
				.values({
					puzzleId: puzzle.id,
					userId: user.id,
					placements,
					finishedAt,
				})
				.onConflictDoUpdate({
					target: [rankPuzzleResults.puzzleId, rankPuzzleResults.userId],
					set: { placements, finishedAt },
					setWhere: sql`cardinality(${rankPuzzleResults.placements}) = 0`,
				})
			const saved = await db.query.rankPuzzleResults.findFirst({
				where: { puzzleId: puzzle.id, userId: user.id },
			})
			return loadRankPlayView(puzzle, saved?.placements ?? placements)
		},
	}),
}))
