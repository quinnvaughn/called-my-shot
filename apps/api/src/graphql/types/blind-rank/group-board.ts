import type { User } from "../../../db/schema"
import { arcadeDay, isArcadeDay } from "../../../lib/arcade/day"
import { loadRankResultsBetween } from "../../../lib/blind-rank/load"
import {
	evaluateRankPlacements,
	rankSquaresCode,
} from "../../../lib/blind-rank/play"
import { builder } from "../../builder"
import { loadGroupMemberUsers } from "../arcade/members"
import { GroupRef } from "../group"
import { viewerMembership } from "../group/leaderboard"
import { UserRef } from "../user"

const RankBoardStatusEnum = builder.enumType("RankBoardStatus", {
	values: {
		DONE: { value: "done" },
		PLAYING: { value: "playing" },
		NOT_PLAYED: { value: "not_played" },
	} as const,
})

type BoardRow = {
	user: User
	status: "done" | "playing" | "not_played"
	// One per slot from the top once done: whether it was right.
	squares: boolean[]
	correctCount: number | null
}

const RankBoardRowRef = builder.objectRef<BoardRow>("RankBoardRow").implement({
	fields: (t) => ({
		user: t.field({ type: UserRef, resolve: (r) => r.user }),
		status: t.field({ type: RankBoardStatusEnum, resolve: (r) => r.status }),
		squares: t.field({ type: ["Boolean"], resolve: (r) => r.squares }),
		correctCount: t.int({ nullable: true, resolve: (r) => r.correctCount }),
	}),
})

const RankBoardRef = builder
	.objectRef<{ date: string; today: BoardRow[] }>("RankBoard")
	.implement({
		fields: (t) => ({
			date: t.exposeString("date"),
			// Done first, most right first, then whoever hasn't finished.
			today: t.field({ type: [RankBoardRowRef], resolve: (b) => b.today }),
		}),
	})

const STATUS_ORDER = { done: 0, playing: 1, not_played: 2 }

builder.objectField(GroupRef, "rankBoard", (t) =>
	t.field({
		type: RankBoardRef,
		nullable: true,
		description: "Members' Blind Rank results for a day. Members only.",
		args: { date: t.arg.string({ required: false }) },
		resolve: async (group, args, ctx) => {
			if (!(await viewerMembership(ctx, group.id))) return null
			const date =
				args.date && isArcadeDay(args.date) ? args.date : arcadeDay(new Date())
			const members = await loadGroupMemberUsers(group.id)
			const results = await loadRankResultsBetween(
				date,
				date,
				members.map((u) => u.id),
			)
			const today = members
				.map((user): BoardRow => {
					const result = results.find((r) => r.userId === user.id)
					if (!result || result.placements.length === 0) {
						return {
							user,
							status: "not_played",
							squares: [],
							correctCount: null,
						}
					}
					const state = evaluateRankPlacements(result.items, result.placements)
					return {
						user,
						status: state.done ? "done" : "playing",
						squares: [...rankSquaresCode(state)].map((c) => c === "g"),
						correctCount: state.correctCount,
					}
				})
				.sort(
					(a, b) =>
						STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
						(b.correctCount ?? 0) - (a.correctCount ?? 0),
				)
			return { date, today }
		},
	}),
)
