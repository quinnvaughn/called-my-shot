import type { User } from "../../../db/schema"
import { addArcadeDays, arcadeDay } from "../../../lib/arcade/day"
import { loadRankResultsBetween } from "../../../lib/blind-rank/load"
import { evaluateRankPlacements } from "../../../lib/blind-rank/play"
import { weekContaining } from "../../../lib/group-recap/week"
import { loadSeasonResultsBetween } from "../../../lib/season-puzzles/load"
import { evaluateSeasonGuesses } from "../../../lib/season-puzzles/play"
import { loadChainResultsBetween } from "../../../lib/teammate-chain/load"
import {
	chainDayPoints,
	evaluateChainMoves,
} from "../../../lib/teammate-chain/play"
import { loadWatchResultsBetween } from "../../../lib/were-you-watching/load"
import { builder } from "../../builder"
import { GroupRef } from "../group"
import { viewerMembership } from "../group/leaderboard"
import { seasonDayPoints } from "../season-puzzle/group-board"
import { UserRef } from "../user"
import { loadGroupMemberUsers } from "./members"

type WeekRow = { user: User; points: number; played: number }

// A member's best Were You Watching? score each day they finished one, so a
// night of a dozen teams' quizzes counts like one game.
function bestWatchByDay(
	results: Awaited<ReturnType<typeof loadWatchResultsBetween>>,
): Map<string, number> {
	const best = new Map<string, number>()
	for (const { attempt } of results) {
		if (!attempt.finishedAt) continue
		const day = arcadeDay(attempt.finishedAt)
		best.set(day, Math.max(best.get(day) ?? 0, attempt.correctCount))
	}
	return best
}

const ArcadeWeekRowRef = builder.objectRef<WeekRow>("ArcadeWeekRow").implement({
	fields: (t) => ({
		user: t.field({ type: UserRef, resolve: (r) => r.user }),
		// Name That Season's 7 minus guesses, plus Blind Rank's slots right,
		// plus Teammate Chain's 6 at par less a point per link over, plus
		// questions right on Were You Watching?, one quiz a day (the best).
		points: t.exposeInt("points"),
		// Finished games, every game counted.
		played: t.exposeInt("played"),
	}),
})

builder.objectField(GroupRef, "arcadeWeek", (t) =>
	t.field({
		type: [ArcadeWeekRowRef],
		nullable: true,
		description:
			"Members' points from the arcade games over the group's recap week, Tuesday to Monday, most first. Members only.",
		resolve: async (group, _args, ctx) => {
			if (!(await viewerMembership(ctx, group.id))) return null
			const week = weekContaining(new Date())
			const first = arcadeDay(week.start)
			const last = addArcadeDays(arcadeDay(week.end), -1)
			const members = await loadGroupMemberUsers(group.id)
			const ids = members.map((u) => u.id)
			const [seasonResults, rankResults, chainResults, watchResults] =
				await Promise.all([
					loadSeasonResultsBetween(first, last, ids),
					loadRankResultsBetween(first, last, ids),
					loadChainResultsBetween(first, last, ids),
					loadWatchResultsBetween(first, last, ids),
				])
			return members
				.map((user) => {
					const seasonStates = seasonResults
						.filter((r) => r.userId === user.id)
						.map((r) => evaluateSeasonGuesses(r, r.guesses))
					const rankStates = rankResults
						.filter((r) => r.userId === user.id)
						.map((r) => evaluateRankPlacements(r.items, r.placements))
					const chainGames = chainResults
						.filter((r) => r.userId === user.id)
						.map((r) => ({ par: r.par, state: evaluateChainMoves(r.moves) }))
					const watchDays = bestWatchByDay(
						watchResults.filter((r) => r.attempt.userId === user.id),
					)
					return {
						user,
						points:
							seasonStates.reduce((sum, s) => sum + seasonDayPoints(s), 0) +
							rankStates.reduce((sum, s) => sum + (s.correctCount ?? 0), 0) +
							chainGames.reduce(
								(sum, g) => sum + chainDayPoints(g.state, g.par),
								0,
							) +
							[...watchDays.values()].reduce((sum, n) => sum + n, 0),
						played:
							seasonStates.filter((s) => s.over).length +
							rankStates.filter((s) => s.done).length +
							chainGames.filter((g) => g.state.over).length +
							watchDays.size,
					}
				})
				.sort((a, b) => b.points - a.points || b.played - a.played)
		},
	}),
)
