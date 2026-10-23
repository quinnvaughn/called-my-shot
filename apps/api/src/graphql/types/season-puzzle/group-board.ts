import type { User } from "../../../db/schema"
import { arcadeDay, isArcadeDay } from "../../../lib/arcade/day"
import { loadSeasonResultsBetween } from "../../../lib/season-puzzles/load"
import {
	evaluateSeasonGuesses,
	SEASON_PUZZLE_MAX_GUESSES,
	type SeasonGuessOutcome,
	type SeasonPlayState,
} from "../../../lib/season-puzzles/play"
import { builder } from "../../builder"
import { loadGroupMemberUsers } from "../arcade/members"
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

const SeasonBoardRef = builder
	.objectRef<{ date: string; today: BoardRow[] }>("SeasonPuzzleBoard")
	.implement({
		fields: (t) => ({
			date: t.exposeString("date"),
			// Played first, best result first, then whoever hasn't played.
			today: t.field({ type: [SeasonBoardRowRef], resolve: (b) => b.today }),
		}),
	})

const STATUS_ORDER = { solved: 0, missed: 1, playing: 2, not_played: 3 }

builder.objectField(GroupRef, "seasonPuzzleBoard", (t) =>
	t.field({
		type: SeasonBoardRef,
		nullable: true,
		description: "Members' Name That Season results for a day. Members only.",
		args: { date: t.arg.string({ required: false }) },
		resolve: async (group, args, ctx) => {
			if (!(await viewerMembership(ctx, group.id))) return null
			const date =
				args.date && isArcadeDay(args.date) ? args.date : arcadeDay(new Date())
			const memberUsers = await loadGroupMemberUsers(group.id)
			const results = await loadSeasonResultsBetween(
				date,
				date,
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

			return { date, today }
		},
	}),
)
