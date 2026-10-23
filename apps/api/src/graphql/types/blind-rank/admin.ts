import { and, eq } from "drizzle-orm"
import { db } from "../../../db"
import {
	type RankPuzzle,
	rankPuzzleResults,
	rankPuzzles,
} from "../../../db/schema"
import { addArcadeDays, arcadeDay } from "../../../lib/arcade/day"
import { requireAdmin } from "../../../lib/auth"
import { findRankPuzzleForDay } from "../../../lib/blind-rank/load"
import { trueSlotsOf } from "../../../lib/blind-rank/play"
import {
	buildRankPuzzleFor,
	RANK_KINDS,
	usedRankSignatures,
} from "../../../lib/blind-rank/schedule"
import {
	AuthenticationError,
	AuthorizationError,
	NotFoundError,
	ValidationError,
} from "../../../lib/errors"
import { builder } from "../../builder"
import { futureArcadeDay } from "../arcade/override-day"
import { LeagueRef } from "../sports"
import { RankPuzzleRef } from "./refs"

// The longest prompt or context an admin can write.
const PROMPT_MAX_LENGTH = 80

export const RankKindEnum = builder.enumType("RankPuzzleKind", {
	values: {
		SEASON_STAT: { value: "season_stat" },
		CAREER_STAT: { value: "career_stat" },
		TEAM_SEASON: { value: "team_season" },
		FRANCHISE: { value: "franchise" },
	} as const,
})

const RankAdminItemRef = builder
	.objectRef<{ label: string; sublabel: string | null; display: string }>(
		"RankAdminItem",
	)
	.implement({
		fields: (t) => ({
			label: t.exposeString("label"),
			sublabel: t.exposeString("sublabel", { nullable: true }),
			display: t.exposeString("display"),
		}),
	})

// A day's puzzle as the admin schedule shows it: what's ranked, the true
// order with values, and how many have played it.
const RankPuzzleAdminRef = builder
	.objectRef<RankPuzzle>("RankPuzzleAdmin")
	.implement({
		fields: (t) => ({
			id: t.exposeID("id"),
			date: t.exposeString("playDate"),
			kind: t.field({ type: RankKindEnum, resolve: (p) => p.kind }),
			prompt: t.exposeString("prompt"),
			context: t.exposeString("context"),
			league: t.field({
				type: LeagueRef,
				resolve: async (p) => {
					const league = await db.query.leagues.findFirst({
						where: { id: p.leagueId },
					})
					if (!league) throw new Error(`league ${p.leagueId} missing`)
					return league
				},
			}),
			// Top first.
			order: t.field({
				type: [RankAdminItemRef],
				resolve: (p) => {
					const slots = trueSlotsOf(p.items)
					return p.items
						.map((item, i) => ({ item, slot: slots[i] ?? 0 }))
						.sort((a, b) => a.slot - b.slot)
						.map(({ item }) => item)
				},
			}),
			played: t.int({
				resolve: (p) =>
					db.$count(rankPuzzleResults, eq(rankPuzzleResults.puzzleId, p.id)),
			}),
		}),
	})

const RankScheduleDayRef = builder
	.objectRef<{ date: string; puzzle: RankPuzzle | null }>("RankScheduleDay")
	.implement({
		fields: (t) => ({
			date: t.exposeString("date"),
			puzzle: t.field({
				type: RankPuzzleAdminRef,
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

async function puzzleOn(date: string): Promise<RankPuzzle> {
	const puzzle = await findRankPuzzleForDay(date)
	if (!puzzle) throw new NotFoundError("Nothing is scheduled that day")
	return puzzle
}

builder.queryFields((t) => ({
	adminRankSchedule: t.field({
		type: [RankScheduleDayRef],
		errors: { types: adminErrors },
		args: { days: t.arg.int({ required: false }) },
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const today = arcadeDay(new Date())
			const span = Math.min(Math.max(args.days ?? 30, 1), 90)
			const last = addArcadeDays(today, span - 1)
			const scheduled = await db.query.rankPuzzles.findMany({
				where: { playDate: { gte: today, lte: last } },
			})
			const byDay = new Map(scheduled.map((p) => [p.playDate, p]))
			return Array.from({ length: span }, (_, i) => {
				const date = addArcadeDays(today, i)
				return { date, puzzle: byDay.get(date) ?? null }
			})
		},
	}),
}))

builder.queryFields((t) => ({
	// Any scheduled day's puzzle as players get it, for an admin to play as
	// practice through rankPuzzleGuestPlay. Nothing played that way is saved.
	adminRankPuzzle: t.field({
		type: RankPuzzleRef,
		errors: {
			types: adminEntityErrors,
			directResult: true,
			union: { name: "AdminRankPuzzleResult" },
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
	resetMyRankPlay: t.field({
		type: RankPuzzleRef,
		errors: {
			types: adminEntityErrors,
			directResult: true,
			union: { name: "ResetMyRankPlayResult" },
		},
		resolve: async (_root, _args, ctx) => {
			const user = requireAdmin(ctx)
			const puzzle = await puzzleOn(arcadeDay(new Date()))
			await db
				.delete(rankPuzzleResults)
				.where(
					and(
						eq(rankPuzzleResults.puzzleId, puzzle.id),
						eq(rankPuzzleResults.userId, user.id),
					),
				)
			return puzzle
		},
	}),

	// A new random puzzle for a day after today, of `kind` in `leagueId`'s
	// league when given, otherwise the same as what's there.
	rerollRankPuzzle: t.field({
		type: RankPuzzleAdminRef,
		errors: {
			types: adminEntityErrors,
			directResult: true,
			union: { name: "RerollRankPuzzleResult" },
		},
		args: {
			date: t.arg.string({ required: true }),
			kind: t.arg({ type: RankKindEnum, required: false }),
			leagueId: t.arg.id({ required: false }),
		},
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const date = futureArcadeDay(args.date)
			const current = await findRankPuzzleForDay(date)
			const leagueId = args.leagueId ? String(args.leagueId) : current?.leagueId
			if (!leagueId) {
				throw ValidationError.field("leagueId", "Pick a league.")
			}
			const kinds = args.kind
				? [args.kind]
				: current
					? [current.kind]
					: RANK_KINDS
			const built = await buildRankPuzzleFor(
				leagueId,
				kinds,
				await usedRankSignatures(),
			)
			if (!built || (args.leagueId && built.leagueId !== leagueId)) {
				throw ValidationError.field(
					null,
					"No new puzzle of that kind is left in that league.",
				)
			}
			const values = { ...built.puzzle, leagueId: built.leagueId }
			await db
				.insert(rankPuzzles)
				.values({ ...values, playDate: date })
				.onConflictDoUpdate({ target: rankPuzzles.playDate, set: values })
			return puzzleOn(date)
		},
	}),

	// Rewords what a day's puzzle ranks, today's included.
	editRankPrompt: t.field({
		type: RankPuzzleAdminRef,
		errors: {
			types: adminEntityErrors,
			directResult: true,
			union: { name: "EditRankPromptResult" },
		},
		args: {
			date: t.arg.string({ required: true }),
			prompt: t.arg.string({ required: true }),
			context: t.arg.string({ required: true }),
		},
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const current = await puzzleOn(args.date)
			if (current.playDate < arcadeDay(new Date())) {
				throw ValidationError.field("date", "That day is over.")
			}
			const prompt = args.prompt.trim()
			const context = args.context.trim()
			for (const [field, value] of [
				["prompt", prompt],
				["context", context],
			] as const) {
				if (value.length === 0 || value.length > PROMPT_MAX_LENGTH) {
					throw ValidationError.field(
						field,
						`Keep it between 1 and ${PROMPT_MAX_LENGTH} characters.`,
					)
				}
			}
			await db
				.update(rankPuzzles)
				.set({ prompt, context })
				.where(eq(rankPuzzles.id, current.id))
			return puzzleOn(current.playDate)
		},
	}),

	// Trades two days' puzzles. Returns the one now on `date`.
	swapRankPuzzles: t.field({
		type: RankPuzzleAdminRef,
		errors: {
			types: adminEntityErrors,
			directResult: true,
			union: { name: "SwapRankPuzzlesResult" },
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
					.update(rankPuzzles)
					.set({ playDate: `swap:${a.id}` })
					.where(eq(rankPuzzles.id, a.id))
				await tx
					.update(rankPuzzles)
					.set({ playDate: date })
					.where(eq(rankPuzzles.id, b.id))
				await tx
					.update(rankPuzzles)
					.set({ playDate: otherDate })
					.where(eq(rankPuzzles.id, a.id))
			})
			return puzzleOn(date)
		},
	}),
}))
