import { and, eq } from "drizzle-orm"
import { db } from "../../../db"
import {
	type League,
	seasonPuzzleResults,
	seasonPuzzles,
} from "../../../db/schema"
import { addArcadeDays, arcadeDay } from "../../../lib/arcade/day"
import { requireAdmin } from "../../../lib/auth"
import {
	AuthenticationError,
	AuthorizationError,
	NotFoundError,
	ValidationError,
} from "../../../lib/errors"
import { isSeasonLeague } from "../../../lib/season-puzzles/archive-parse"
import { seasonClues } from "../../../lib/season-puzzles/clues"
import {
	findSeasonPuzzleForDay,
	type LoadedSeasonPuzzle,
} from "../../../lib/season-puzzles/load"
import {
	pickSeason,
	recentSchedule,
	schedulableSeasons,
} from "../../../lib/season-puzzles/schedule"
import { builder } from "../../builder"
import { futureArcadeDay } from "../arcade/override-day"
import { LeagueRef } from "../sports"
import { SeasonPuzzleRef, TeamSeasonRef } from "./refs"

// The longest a clue can be when an admin rewrites one.
const CLUE_MAX_LENGTH = 200

// A day's puzzle as the admin schedule shows it: the answer, its clues, and
// how many people have played it.
const SeasonPuzzleAdminRef = builder
	.objectRef<LoadedSeasonPuzzle>("SeasonPuzzleAdmin")
	.implement({
		fields: (t) => ({
			id: t.exposeID("id"),
			date: t.exposeString("playDate"),
			answer: t.field({
				type: TeamSeasonRef,
				resolve: (p) => p.teamSeason,
			}),
			clues: t.exposeStringList("clues"),
			played: t.int({
				resolve: async (p) =>
					db.$count(
						seasonPuzzleResults,
						eq(seasonPuzzleResults.puzzleId, p.id),
					),
			}),
		}),
	})

const SeasonScheduleDayRef = builder
	.objectRef<{ date: string; puzzle: LoadedSeasonPuzzle | null }>(
		"SeasonPuzzleScheduleDay",
	)
	.implement({
		fields: (t) => ({
			date: t.exposeString("date"),
			puzzle: t.field({
				type: SeasonPuzzleAdminRef,
				nullable: true,
				resolve: (d) => d.puzzle,
			}),
		}),
	})

const SeasonPoolRef = builder
	.objectRef<{ league: League; ready: number }>("SeasonPuzzlePool")
	.implement({
		fields: (t) => ({
			league: t.field({ type: LeagueRef, resolve: (p) => p.league }),
			// Seasons that can still be scheduled.
			ready: t.exposeInt("ready"),
		}),
	})

const SeasonScheduleRef = builder
	.objectRef<{
		days: { date: string; puzzle: LoadedSeasonPuzzle | null }[]
		pool: { league: League; ready: number }[]
	}>("SeasonPuzzleSchedule")
	.implement({
		fields: (t) => ({
			days: t.field({ type: [SeasonScheduleDayRef], resolve: (s) => s.days }),
			pool: t.field({ type: [SeasonPoolRef], resolve: (s) => s.pool }),
		}),
	})

const adminErrors = [AuthenticationError, AuthorizationError]
const adminEntityErrors = [
	AuthenticationError,
	AuthorizationError,
	NotFoundError,
	ValidationError,
]

async function puzzleOn(date: string): Promise<LoadedSeasonPuzzle> {
	const puzzle = await findSeasonPuzzleForDay(date)
	if (!puzzle) throw new NotFoundError("Nothing is scheduled that day")
	return puzzle
}

// Puts a season on a day, replacing whatever was there.
async function putSeason(
	date: string,
	teamSeasonId: string,
	clues: string[],
): Promise<LoadedSeasonPuzzle> {
	await db
		.insert(seasonPuzzles)
		.values({ teamSeasonId, clues, playDate: date })
		.onConflictDoUpdate({
			target: seasonPuzzles.playDate,
			set: { teamSeasonId, clues },
		})
	return puzzleOn(date)
}

builder.queryFields((t) => ({
	adminSeasonSchedule: t.field({
		type: SeasonScheduleRef,
		errors: { types: adminErrors },
		args: { days: t.arg.int({ required: false }) },
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const today = arcadeDay(new Date())
			const span = Math.min(Math.max(args.days ?? 30, 1), 90)
			const last = addArcadeDays(today, span - 1)
			const [scheduled, pool, leagueRows] = await Promise.all([
				db.query.seasonPuzzles.findMany({
					where: { playDate: { gte: today, lte: last } },
					with: { teamSeason: true },
				}),
				schedulableSeasons(),
				db.query.leagues.findMany({
					where: { status: "active" },
					orderBy: { abbreviation: "asc" },
				}),
			])
			const byDay = new Map(scheduled.map((p) => [p.playDate, p]))
			const ready = new Map<string, number>()
			for (const { season } of pool.values()) {
				ready.set(season.leagueId, (ready.get(season.leagueId) ?? 0) + 1)
			}
			return {
				days: Array.from({ length: span }, (_, i) => {
					const date = addArcadeDays(today, i)
					return { date, puzzle: byDay.get(date) ?? null }
				}),
				pool: leagueRows
					.filter((league) => isSeasonLeague(league.slug))
					.map((league) => ({ league, ready: ready.get(league.id) ?? 0 })),
			}
		},
	}),
}))

builder.queryFields((t) => ({
	// Any scheduled day's puzzle as players get it, for an admin to play as
	// practice through seasonPuzzleGuestPlay. Nothing played that way is
	// saved.
	adminSeasonPuzzle: t.field({
		type: SeasonPuzzleRef,
		errors: {
			types: adminEntityErrors,
			directResult: true,
			union: { name: "AdminSeasonPuzzleResult" },
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
	resetMySeasonPlay: t.field({
		type: SeasonPuzzleRef,
		errors: {
			types: adminEntityErrors,
			directResult: true,
			union: { name: "ResetMySeasonPlayResult" },
		},
		resolve: async (_root, _args, ctx) => {
			const user = requireAdmin(ctx)
			const puzzle = await puzzleOn(arcadeDay(new Date()))
			await db
				.delete(seasonPuzzleResults)
				.where(
					and(
						eq(seasonPuzzleResults.puzzleId, puzzle.id),
						eq(seasonPuzzleResults.userId, user.id),
					),
				)
			return puzzle
		},
	}),

	// A random season in place of a day's, from the same league, or from
	// `leagueId` when given. Fills an empty day too.
	rerollSeasonPuzzle: t.field({
		type: SeasonPuzzleAdminRef,
		errors: {
			types: adminEntityErrors,
			directResult: true,
			union: { name: "RerollSeasonPuzzleResult" },
		},
		args: {
			date: t.arg.string({ required: true }),
			leagueId: t.arg.id({ required: false }),
		},
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const date = futureArcadeDay(args.date)
			const current = await findSeasonPuzzleForDay(date)
			const leagueId = args.leagueId
				? String(args.leagueId)
				: current?.teamSeason.leagueId
			const [pool, recent] = await Promise.all([
				schedulableSeasons(leagueId),
				recentSchedule(arcadeDay(new Date())),
			])
			const pick = pickSeason(
				[...pool.values()].map(({ season }) => ({
					id: season.id,
					leagueId: season.leagueId,
					teamId: season.teamId,
				})),
				recent.filter((s) => s.day !== date),
				date,
				Math.random,
			)
			const entry = pick && pool.get(pick.id)
			if (!entry) {
				throw ValidationError.field(
					null,
					"No season is left to schedule there.",
				)
			}
			return putSeason(date, entry.season.id, entry.clues)
		},
	}),

	// A specific franchise's season on a day.
	setSeasonPuzzle: t.field({
		type: SeasonPuzzleAdminRef,
		errors: {
			types: adminEntityErrors,
			directResult: true,
			union: { name: "SetSeasonPuzzleResult" },
		},
		args: {
			date: t.arg.string({ required: true }),
			teamId: t.arg.id({ required: true }),
			year: t.arg.int({ required: true }),
		},
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const date = futureArcadeDay(args.date)
			const season = await db.query.teamSeasons.findFirst({
				where: { teamId: String(args.teamId), year: args.year },
				with: { league: true },
			})
			if (!season) {
				throw ValidationError.field("year", "That season isn't in the archive.")
			}
			const ran = await db.query.seasonPuzzles.findFirst({
				where: { teamSeasonId: season.id },
			})
			if (ran && ran.playDate !== date) {
				throw ValidationError.field(
					"year",
					`That season is already scheduled for ${ran.playDate}.`,
				)
			}
			const clues = isSeasonLeague(season.league.slug)
				? seasonClues(season.league.slug, season)
				: null
			if (!clues) {
				throw ValidationError.field(
					"year",
					"ESPN's leaders for that season are too thin to make clues.",
				)
			}
			return putSeason(date, season.id, clues)
		},
	}),

	// Rewrites a day's clues, today's included, for a clue that reads wrong.
	editSeasonPuzzleClues: t.field({
		type: SeasonPuzzleAdminRef,
		errors: {
			types: adminEntityErrors,
			directResult: true,
			union: { name: "EditSeasonPuzzleCluesResult" },
		},
		args: {
			date: t.arg.string({ required: true }),
			clues: t.arg.stringList({ required: true }),
		},
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const current = await puzzleOn(args.date)
			if (current.playDate < arcadeDay(new Date())) {
				throw ValidationError.field("date", "That day is over.")
			}
			const clues = args.clues.map((c) => c.trim())
			if (clues.length !== current.clues.length) {
				throw ValidationError.field(
					"clues",
					`A puzzle has ${current.clues.length} clues.`,
				)
			}
			for (const [index, clue] of clues.entries()) {
				if (clue.length === 0 || clue.length > CLUE_MAX_LENGTH) {
					throw ValidationError.field(
						`clues.${index}`,
						`Keep each clue between 1 and ${CLUE_MAX_LENGTH} characters.`,
					)
				}
			}
			await db
				.update(seasonPuzzles)
				.set({ clues })
				.where(eq(seasonPuzzles.id, current.id))
			return puzzleOn(current.playDate)
		},
	}),

	// Trades two days' puzzles. Returns the one now on `date`.
	swapSeasonPuzzles: t.field({
		type: SeasonPuzzleAdminRef,
		errors: {
			types: adminEntityErrors,
			directResult: true,
			union: { name: "SwapSeasonPuzzlesResult" },
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
				await tx
					.update(seasonPuzzles)
					.set({ teamSeasonId: b.teamSeasonId, clues: b.clues })
					.where(eq(seasonPuzzles.id, a.id))
				await tx
					.update(seasonPuzzles)
					.set({ teamSeasonId: a.teamSeasonId, clues: a.clues })
					.where(eq(seasonPuzzles.id, b.id))
			})
			return puzzleOn(date)
		},
	}),
}))
