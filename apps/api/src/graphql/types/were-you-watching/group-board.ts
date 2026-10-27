import { db } from "../../../db"
import type { User, WatchQuizAttempt } from "../../../db/schema"
import { addArcadeDays, arcadeDay } from "../../../lib/arcade/day"
import { weekContaining } from "../../../lib/group-recap/week"
import { isUuid } from "../../../lib/uuid"
import {
	findWatchQuiz,
	type LoadedWatchQuiz,
	loadWatchResultsBetween,
} from "../../../lib/were-you-watching/load"
import { watchSeconds } from "../../../lib/were-you-watching/play"
import { builder } from "../../builder"
import { loadGroupMemberUsers } from "../arcade/members"
import { GroupRef } from "../group"
import { viewerMembership } from "../group/leaderboard"
import { UserRef } from "../user"
import { WatchQuizRef } from "./refs"

const WatchGroupStatusEnum = builder.enumType("WatchGroupStatus", {
	values: {
		FINISHED: { value: "finished" },
		PLAYING: { value: "playing" },
		NOT_PLAYED: { value: "not_played" },
	} as const,
})

type MemberRow = {
	user: User
	status: "finished" | "playing" | "not_played"
	attempt: WatchQuizAttempt | null
}

const WatchGroupMemberRef = builder
	.objectRef<MemberRow>("WatchGroupMember")
	.implement({
		fields: (t) => ({
			user: t.field({ type: UserRef, resolve: (r) => r.user }),
			status: t.field({ type: WatchGroupStatusEnum, resolve: (r) => r.status }),
			// Null until they've finished.
			correct: t.int({
				nullable: true,
				resolve: (r) =>
					r.status === "finished" ? (r.attempt?.correctCount ?? null) : null,
			}),
			seconds: t.float({
				nullable: true,
				resolve: (r) =>
					r.status === "finished" && r.attempt
						? watchSeconds(r.attempt.totalMs)
						: null,
			}),
			clean: t.boolean({ resolve: (r) => r.attempt?.clean ?? true }),
		}),
	})

const WatchGroupBoardRef = builder
	.objectRef<{ quiz: LoadedWatchQuiz; members: MemberRow[] }>("WatchGroupBoard")
	.implement({
		fields: (t) => ({
			quiz: t.field({ type: WatchQuizRef, resolve: (b) => b.quiz }),
			// Finished first, most right then fastest, then still playing, then
			// whoever hasn't played.
			members: t.field({
				type: [WatchGroupMemberRef],
				resolve: (b) => b.members,
			}),
		}),
	})

const STATUS_ORDER = { finished: 0, playing: 1, not_played: 2 }

const compareMembers = (a: MemberRow, b: MemberRow) =>
	STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
	(b.attempt?.correctCount ?? 0) - (a.attempt?.correctCount ?? 0) ||
	(a.attempt?.totalMs ?? 0) - (b.attempt?.totalMs ?? 0)

const memberRow = (
	user: User,
	attempt: WatchQuizAttempt | null,
): MemberRow => ({
	user,
	status: !attempt ? "not_played" : attempt.finishedAt ? "finished" : "playing",
	attempt,
})

builder.objectField(GroupRef, "watchQuizBoard", (t) =>
	t.field({
		type: WatchGroupBoardRef,
		nullable: true,
		description:
			"Every member's run on one Were You Watching? quiz. Members only.",
		args: { quizId: t.arg.id({ required: true }) },
		resolve: async (group, args, ctx) => {
			if (!(await viewerMembership(ctx, group.id))) return null
			const quizId = String(args.quizId)
			const quiz = isUuid(quizId) ? await findWatchQuiz(quizId) : null
			if (!quiz) return null
			const members = await loadGroupMemberUsers(group.id)
			const attempts = await db.query.watchQuizAttempts.findMany({
				where: { quizId, userId: { in: members.map((u) => u.id) } },
			})
			return {
				quiz,
				members: members
					.map((user) =>
						memberRow(user, attempts.find((a) => a.userId === user.id) ?? null),
					)
					.sort(compareMembers),
			}
		},
	}),
)

builder.objectField(GroupRef, "watchRecent", (t) =>
	t.field({
		type: [WatchGroupBoardRef],
		nullable: true,
		description:
			"The Were You Watching? quizzes members finished over the group's recap week, the most played first, with only who finished each. Members only.",
		resolve: async (group, _args, ctx) => {
			if (!(await viewerMembership(ctx, group.id))) return null
			const week = weekContaining(new Date())
			const members = await loadGroupMemberUsers(group.id)
			const results = await loadWatchResultsBetween(
				arcadeDay(week.start),
				addArcadeDays(arcadeDay(week.end), -1),
				members.map((u) => u.id),
			)
			const byQuiz = new Map<string, typeof results>()
			for (const result of results) {
				byQuiz.set(result.quizId, [
					...(byQuiz.get(result.quizId) ?? []),
					result,
				])
			}
			const boards = await Promise.all(
				[...byQuiz].map(async ([quizId, rows]) => {
					const quiz = await findWatchQuiz(quizId)
					if (!quiz) return null
					return {
						quiz,
						members: rows
							.flatMap((r) => {
								const user = members.find((u) => u.id === r.attempt.userId)
								return user ? [memberRow(user, r.attempt)] : []
							})
							.sort(compareMembers),
					}
				}),
			)
			return boards
				.filter((b) => b !== null)
				.sort(
					(a, b) =>
						b.members.length - a.members.length ||
						b.quiz.gameStartsAt.getTime() - a.quiz.gameStartsAt.getTime(),
				)
		},
	}),
)
