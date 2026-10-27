import type { User } from "../../../db/schema"
import { arcadeDay, isArcadeDay } from "../../../lib/arcade/day"
import {
	findChainPuzzleForDay,
	loadChainResultsBetween,
} from "../../../lib/teammate-chain/load"
import {
	chainSeconds,
	evaluateChainMoves,
} from "../../../lib/teammate-chain/play"
import { builder } from "../../builder"
import { loadGroupMemberUsers } from "../arcade/members"
import { GroupRef } from "../group"
import { viewerMembership } from "../group/leaderboard"
import { UserRef } from "../user"

const ChainBoardStatusEnum = builder.enumType("TeammateChainBoardStatus", {
	values: {
		SOLVED: { value: "solved" },
		GAVE_UP: { value: "gave_up" },
		PLAYING: { value: "playing" },
		NOT_PLAYED: { value: "not_played" },
	} as const,
})

type BoardRow = {
	user: User
	status: "solved" | "gave_up" | "playing" | "not_played"
	links: number | null
	hints: number
	misses: number
	seconds: number | null
}

const ChainBoardRowRef = builder
	.objectRef<BoardRow>("TeammateChainBoardRow")
	.implement({
		fields: (t) => ({
			user: t.field({ type: UserRef, resolve: (r) => r.user }),
			status: t.field({
				type: ChainBoardStatusEnum,
				resolve: (r) => r.status,
			}),
			// Never the players in the chain: members see how, not who.
			links: t.int({ nullable: true, resolve: (r) => r.links }),
			hints: t.exposeInt("hints"),
			misses: t.exposeInt("misses"),
			seconds: t.int({ nullable: true, resolve: (r) => r.seconds }),
		}),
	})

const ChainBoardRef = builder
	.objectRef<{ date: string; par: number | null; today: BoardRow[] }>(
		"TeammateChainBoard",
	)
	.implement({
		fields: (t) => ({
			date: t.exposeString("date"),
			// Null when nothing ran that day.
			par: t.int({ nullable: true, resolve: (b) => b.par }),
			// Solved first by fewest links, then fewest hints, then fewest
			// misses, then fastest; then given up, still playing, and whoever
			// hasn't played.
			today: t.field({ type: [ChainBoardRowRef], resolve: (b) => b.today }),
		}),
	})

const STATUS_ORDER = { solved: 0, gave_up: 1, playing: 2, not_played: 3 }

export function compareChainBoardRows(a: BoardRow, b: BoardRow): number {
	return (
		STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
		(a.links ?? 0) - (b.links ?? 0) ||
		a.hints - b.hints ||
		a.misses - b.misses ||
		(a.seconds ?? Infinity) - (b.seconds ?? Infinity)
	)
}

builder.objectField(GroupRef, "teammateChainBoard", (t) =>
	t.field({
		type: ChainBoardRef,
		nullable: true,
		description: "Members' Teammate Chain results for a day. Members only.",
		args: { date: t.arg.string({ required: false }) },
		resolve: async (group, args, ctx) => {
			if (!(await viewerMembership(ctx, group.id))) return null
			const date =
				args.date && isArcadeDay(args.date) ? args.date : arcadeDay(new Date())
			const [members, puzzle] = await Promise.all([
				loadGroupMemberUsers(group.id),
				findChainPuzzleForDay(date),
			])
			const results = await loadChainResultsBetween(
				date,
				date,
				members.map((u) => u.id),
			)
			const today = members
				.map((user): BoardRow => {
					const result = results.find((r) => r.userId === user.id)
					if (!result) {
						return {
							user,
							status: "not_played",
							links: null,
							hints: 0,
							misses: 0,
							seconds: null,
						}
					}
					const state = evaluateChainMoves(result.moves)
					return {
						user,
						status: state.status,
						links: state.links,
						hints: state.hints,
						misses: state.misses,
						seconds:
							state.status === "solved"
								? chainSeconds(result.startedAt, result.finishedAt)
								: null,
					}
				})
				.sort(compareChainBoardRows)
			return { date, par: puzzle?.par ?? null, today }
		},
	}),
)
