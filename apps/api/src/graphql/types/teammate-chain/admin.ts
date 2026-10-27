import { and, eq } from "drizzle-orm"
import { db } from "../../../db"
import { teammateChainPuzzles, teammateChainResults } from "../../../db/schema"
import { addArcadeDays, arcadeDay } from "../../../lib/arcade/day"
import { requireAdmin } from "../../../lib/auth"
import {
	AuthenticationError,
	AuthorizationError,
	NotFoundError,
	ValidationError,
} from "../../../lib/errors"
import {
	findChainPuzzleForDay,
	type LoadedChainPuzzle,
	loadChainPlayers,
} from "../../../lib/teammate-chain/load"
import {
	buildChainPuzzleFor,
	chainLeagueIds,
	chainLeagueOrder,
	recentChainSchedule,
	usedChainSignatures,
} from "../../../lib/teammate-chain/schedule"
import { builder } from "../../builder"
import { futureArcadeDay } from "../arcade/override-day"
import { ChainPlayerRef, ChainPuzzleRef } from "./refs"

// A day's puzzle as the admin schedule shows it: the ends, par, a par route
// and how many have played it.
const ChainPuzzleAdminRef = builder
	.objectRef<LoadedChainPuzzle>("TeammateChainPuzzleAdmin")
	.implement({
		fields: (t) => ({
			puzzle: t.field({ type: ChainPuzzleRef, resolve: (p) => p }),
			parRoute: t.field({
				type: [ChainPlayerRef],
				resolve: async (p) => {
					const found = await loadChainPlayers(p.leagueId, p.parRoute)
					return p.parRoute.flatMap((id) => {
						const player = found.get(id)
						return player ? [player] : []
					})
				},
			}),
			played: t.int({
				resolve: (p) =>
					db.$count(
						teammateChainResults,
						eq(teammateChainResults.puzzleId, p.id),
					),
			}),
		}),
	})

const ChainScheduleDayRef = builder
	.objectRef<{ date: string; puzzle: LoadedChainPuzzle | null }>(
		"TeammateChainScheduleDay",
	)
	.implement({
		fields: (t) => ({
			date: t.exposeString("date"),
			puzzle: t.field({
				type: ChainPuzzleAdminRef,
				nullable: true,
				resolve: (d) => d.puzzle,
			}),
		}),
	})

const adminErrors = [AuthenticationError, AuthorizationError]
const adminEntityErrors = [
	AuthenticationError,
	AuthorizationError,
	NotFoundError,
	ValidationError,
]

async function puzzleOn(date: string): Promise<LoadedChainPuzzle> {
	const puzzle = await findChainPuzzleForDay(date)
	if (!puzzle) throw new NotFoundError("Nothing is scheduled that day")
	return puzzle
}

builder.queryFields((t) => ({
	adminTeammateChainSchedule: t.field({
		type: [ChainScheduleDayRef],
		errors: { types: adminErrors },
		args: { days: t.arg.int({ required: false }) },
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const today = arcadeDay(new Date())
			const span = Math.min(Math.max(args.days ?? 30, 1), 90)
			const last = addArcadeDays(today, span - 1)
			const scheduled = await db.query.teammateChainPuzzles.findMany({
				where: { playDate: { gte: today, lte: last } },
				with: { league: true },
			})
			const byDay = new Map(scheduled.map((p) => [p.playDate, p]))
			return Array.from({ length: span }, (_, i) => {
				const date = addArcadeDays(today, i)
				return { date, puzzle: byDay.get(date) ?? null }
			})
		},
	}),

	// Any scheduled day's puzzle as players get it, for an admin to play as
	// practice through teammateChainGuestPlay. Nothing played that way is
	// saved.
	adminTeammateChainPuzzle: t.field({
		type: ChainPuzzleRef,
		errors: {
			types: adminEntityErrors,
			directResult: true,
			union: { name: "AdminTeammateChainPuzzleResult" },
		},
		args: { date: t.arg.string({ required: true }) },
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			return puzzleOn(args.date)
		},
	}),
}))

builder.mutationFields((t) => ({
	// Deletes the admin's own game on today's puzzle, so they can play it
	// again signed in.
	resetMyTeammateChainPlay: t.field({
		type: ChainPuzzleRef,
		errors: {
			types: adminEntityErrors,
			directResult: true,
			union: { name: "ResetMyTeammateChainPlayResult" },
		},
		resolve: async (_root, _args, ctx) => {
			const user = requireAdmin(ctx)
			const puzzle = await puzzleOn(arcadeDay(new Date()))
			await db
				.delete(teammateChainResults)
				.where(
					and(
						eq(teammateChainResults.puzzleId, puzzle.id),
						eq(teammateChainResults.userId, user.id),
					),
				)
			return puzzle
		},
	}),

	// A new random pair for a day after today, from `leagueId`'s league when
	// given, otherwise the same league as what's there.
	rerollTeammateChainPuzzle: t.field({
		type: ChainPuzzleAdminRef,
		errors: {
			types: adminEntityErrors,
			directResult: true,
			union: { name: "RerollTeammateChainPuzzleResult" },
		},
		args: {
			date: t.arg.string({ required: true }),
			leagueId: t.arg.id({ required: false }),
		},
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const date = futureArcadeDay(args.date)
			const current = await findChainPuzzleForDay(date)
			const today = arcadeDay(new Date())
			const [scheduled, leagueIds, used] = await Promise.all([
				recentChainSchedule(today),
				chainLeagueIds(),
				usedChainSignatures(),
			])
			const leagueId = args.leagueId ? String(args.leagueId) : current?.leagueId
			const order = leagueId
				? [leagueId]
				: chainLeagueOrder(date, scheduled, leagueIds)
			const built = await buildChainPuzzleFor(
				date,
				order,
				scheduled.filter((s) => s.day !== date),
				used,
			)
			if (!built) {
				throw ValidationError.field(null, "No new pair is left in that league.")
			}
			await db
				.insert(teammateChainPuzzles)
				.values({ ...built, playDate: date })
				.onConflictDoUpdate({
					target: teammateChainPuzzles.playDate,
					set: built,
				})
			return puzzleOn(date)
		},
	}),

	// Trades two days' puzzles. Returns the one now on `date`.
	swapTeammateChainPuzzles: t.field({
		type: ChainPuzzleAdminRef,
		errors: {
			types: adminEntityErrors,
			directResult: true,
			union: { name: "SwapTeammateChainPuzzlesResult" },
		},
		args: {
			date: t.arg.string({ required: true }),
			otherDate: t.arg.string({ required: true }),
		},
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const date = futureArcadeDay(args.date)
			const otherDate = futureArcadeDay(args.otherDate)
			const [a, b] = await Promise.all([puzzleOn(date), puzzleOn(otherDate)])
			await db.transaction(async (tx) => {
				// Off the day first, so the unique index never sees two.
				await tx
					.update(teammateChainPuzzles)
					.set({ playDate: `swap:${a.id}` })
					.where(eq(teammateChainPuzzles.id, a.id))
				await tx
					.update(teammateChainPuzzles)
					.set({ playDate: date })
					.where(eq(teammateChainPuzzles.id, b.id))
				await tx
					.update(teammateChainPuzzles)
					.set({ playDate: otherDate })
					.where(eq(teammateChainPuzzles.id, a.id))
			})
			return puzzleOn(date)
		},
	}),
}))
