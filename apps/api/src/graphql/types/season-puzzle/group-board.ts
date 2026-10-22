import { eq } from "drizzle-orm"
import { db } from "../../../db"
import { groupMembers, type User, users } from "../../../db/schema"
import { weekContaining } from "../../../lib/group-recap/week"
import {
	addSeasonPuzzleDays,
	isSeasonPuzzleDay,
	seasonPuzzleDay,
} from "../../../lib/season-puzzles/day"
import { loadSeasonResultsBetween } from "../../../lib/season-puzzles/load"
import {
	evaluateSeasonGuesses,
	SEASON_PUZZLE_MAX_GUESSES,
	type SeasonGuessOutcome,
	type SeasonPlayState,
} from "../../../lib/season-puzzles/play"
import { builder } from "../../builder"
import { GroupRef } from "../group"
import { viewerMembership } from "../group/leaderboard"
import { UserRef } from "../user"
import { SeasonGuessOutcomeEnum } from "./refs"

// A day's points on the group board: solved in 1 is worth 6, in 6 is worth
// 1, a miss or no game is worth nothing.
export function seasonDayPoints(state: SeasonPlayState | null): number {
	if (state?.status !== "solved") return 0
	return SEASON_PUZZLE_MAX_GUESSES + 1 - state.guesses.length
}

const SeasonBoardStatusEnum = builder.enumType("SeasonPuzzleBoardStatus", {
	values: {
		SOLVED: { value: "solved" },
		MISSED: { value: "missed" },
		PLAYING: { value: "playing" },
		NOT_PLAYED: { value: "not_played" },
	} as const,
})

type BoardRow = {
	user: User
	status: "solved" | "missed" | "playing" | "not_played"
	squares: SeasonGuessOutcome[]
}
type WeekRow = { user: User; points: number; played: number }

const SeasonBoardRowRef = builder
	.objectRef<BoardRow>("SeasonPuzzleBoardRow")
	.implement({
		fields: (t) => ({
			user: t.field({ type: UserRef, resolve: (r) => r.user }),
			status: t.field({
				type: SeasonBoardStatusEnum,
				resolve: (r) => r.status,
			}),
			// One per guess made so far, in order: their squares. Shown only to
			// the group's own members, and never with the seasons guessed.
			squares: t.field({
				type: [SeasonGuessOutcomeEnum],
				resolve: (r) => r.squares,
			}),
		}),
	})

const SeasonWeekRowRef = builder
	.objectRef<WeekRow>("SeasonPuzzleWeekRow")
	.implement({
		fields: (t) => ({
			user: t.field({ type: UserRef, resolve: (r) => r.user }),
			points: t.exposeInt("points"),
			played: t.exposeInt("played"),
		}),
	})

const SeasonBoardRef = builder
	.objectRef<{ date: string; today: BoardRow[]; week: WeekRow[] }>(
		"SeasonPuzzleBoard",
	)
	.implement({
		fields: (t) => ({
			date: t.exposeString("date"),
			// Played first, best result first, then whoever hasn't played.
			today: t.field({ type: [SeasonBoardRowRef], resolve: (b) => b.today }),
			// Over the group's recap week, Tuesday to Monday, most points first.
			week: t.field({ type: [SeasonWeekRowRef], resolve: (b) => b.week }),
		}),
	})

const STATUS_ORDER = { solved: 0, missed: 1, playing: 2, not_played: 3 }

builder.objectField(GroupRef, "seasonPuzzleBoard", (t) =>
	t.field({
		type: SeasonBoardRef,
		nullable: true,
		description:
			"Members' Name That Season results: a day's games and the week's standings. Members only.",
		args: { date: t.arg.string({ required: false }) },
		resolve: async (group, args, ctx) => {
			if (!(await viewerMembership(ctx, group.id))) return null
			const now = new Date()
			const date =
				args.date && isSeasonPuzzleDay(args.date)
					? args.date
					: seasonPuzzleDay(now)
			const week = weekContaining(now)
			const weekFirst = seasonPuzzleDay(week.start)
			const weekLast = addSeasonPuzzleDays(seasonPuzzleDay(week.end), -1)

			const members = await db
				.select({ user: users })
				.from(groupMembers)
				.innerJoin(users, eq(users.id, groupMembers.userId))
				.where(eq(groupMembers.groupId, group.id))
			const memberUsers = members.map((m) => m.user)
			const from = date < weekFirst ? date : weekFirst
			const to = date > weekLast ? date : weekLast
			const results = await loadSeasonResultsBetween(
				from,
				to,
				memberUsers.map((u) => u.id),
			)
			const stateOf = (r: (typeof results)[number]) =>
				evaluateSeasonGuesses(r, r.guesses)

			const today: BoardRow[] = memberUsers
				.map((user) => {
					const result = results.find(
						(r) => r.userId === user.id && r.day === date,
					)
					if (!result || result.guesses.length === 0) {
						return { user, status: "not_played" as const, squares: [] }
					}
					const state = stateOf(result)
					return {
						user,
						status: state.status,
						squares: state.guesses.map((g) => g.outcome),
					}
				})
				.sort(
					(a, b) =>
						STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
						a.squares.length - b.squares.length,
				)

			const weekRows: WeekRow[] = memberUsers
				.map((user) => {
					const games = results.filter(
						(r) =>
							r.userId === user.id && r.day >= weekFirst && r.day <= weekLast,
					)
					const states = games.map(stateOf)
					return {
						user,
						points: states.reduce((sum, s) => sum + seasonDayPoints(s), 0),
						played: states.filter((s) => s.status !== "playing").length,
					}
				})
				.sort((a, b) => b.points - a.points || b.played - a.played)

			return { date, today, week: weekRows }
		},
	}),
)
