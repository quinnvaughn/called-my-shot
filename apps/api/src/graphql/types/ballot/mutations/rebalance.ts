import { rebalanceWinTotalsSchema } from "@called-my-shot/schemas"
import { and, eq, inArray } from "drizzle-orm"
import { db } from "../../../../db"
import { LEAGUE_SEASON_FORMAT } from "../../../../db/catalog/league-season-format"
import { callRebalances, calls } from "../../../../db/schema"
import { requireUser } from "../../../../lib/auth"
import {
	AuthenticationError,
	NotFoundError,
	ValidationError,
} from "../../../../lib/errors"
import { rebalanceProblem } from "../../../../lib/rebalance"
import { builder } from "../../../builder"
import { parseInput } from "../../../helpers"

const RebalanceChangeInput = builder.inputType("RebalanceChangeInput", {
	fields: (t) => ({
		questionId: t.id({ required: true }),
		guessValue: t.float({ required: true }),
	}),
})

builder.mutationFields((t) => ({
	// Brings a finished win-totals ballot back toward the wins the schedule
	// actually hands out - see lib/rebalance.ts for what it allows. The call
	// keeps its createdAt: this is a correction to the count, not a new call,
	// so it doesn't cost the caller their place in the field the way a redo
	// does. Each pick it moves is recorded on call_rebalances.
	rebalanceWinTotals: t.field({
		type: "Boolean",
		errors: {
			types: [AuthenticationError, NotFoundError],
			union: { name: "RebalanceWinTotalsResult" },
		},
		args: {
			ballotId: t.arg.id({ required: true }),
			changes: t.arg({ type: [RebalanceChangeInput], required: true }),
		},
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const data = parseInput(rebalanceWinTotalsSchema, args)

			const ballot = await db.query.ballots.findFirst({
				where: { id: data.ballotId, status: "published" },
				with: {
					league: { columns: { slug: true } },
					members: {
						columns: { questionId: true },
						with: {
							question: {
								columns: { status: true, locksAt: true, shape: true },
								with: { stat: { columns: { name: true } } },
							},
						},
					},
				},
			})
			if (!ballot) throw new NotFoundError("Ballot not found")

			const format = ballot.league
				? LEAGUE_SEASON_FORMAT[ballot.league.slug]
				: undefined
			const isWinTotals =
				ballot.members.length > 0 &&
				ballot.members.every(
					(m) =>
						m.question?.shape === "team_season_stat_numeric_guess" &&
						m.question.stat?.name === "Wins",
				)
			if (!format || !isWinTotals) {
				throw ValidationError.field(
					null,
					"Only a win-totals ballot can be rebalanced.",
				)
			}

			// Same real-clock check as castCall: status can lag locksAt.
			const now = new Date()
			const changedIds = new Set(data.changes.map((c) => c.questionId))
			if (
				ballot.members.some(
					(m) =>
						changedIds.has(m.questionId) &&
						(m.question?.status !== "open" || m.question.locksAt <= now),
				)
			) {
				throw ValidationError.field(null, "Those picks are locked.")
			}

			return db.transaction(async (tx) => {
				const memberIds = ballot.members.map((m) => m.questionId)
				const userCalls = await tx
					.select({
						id: calls.id,
						questionId: calls.questionId,
						guessValue: calls.guessValue,
					})
					.from(calls)
					.where(
						and(
							eq(calls.userId, user.id),
							inArray(calls.questionId, memberIds),
						),
					)
					.for("update")
				if (
					userCalls.length !== memberIds.length ||
					userCalls.some((c) => c.guessValue === null)
				) {
					throw ValidationError.field(
						null,
						"Pick every team before rebalancing.",
					)
				}

				const current = new Map(
					userCalls.map((c) => [c.questionId, c.guessValue ?? 0]),
				)
				const problem = rebalanceProblem({
					current,
					changes: data.changes,
					target: (format.gamesPerSeason * memberIds.length) / 2,
					gamesPerSeason: format.gamesPerSeason,
				})
				if (problem) throw ValidationError.field("changes", problem)

				const callByQuestion = new Map(
					userCalls.map((c) => [c.questionId, c]),
				)
				for (const change of data.changes) {
					const call = callByQuestion.get(change.questionId)
					if (!call) continue
					await tx
						.update(calls)
						.set({ guessValue: change.guessValue })
						.where(eq(calls.id, call.id))
					await tx.insert(callRebalances).values({
						callId: call.id,
						ballotId: ballot.id,
						fromGuessValue: call.guessValue ?? 0,
						toGuessValue: change.guessValue,
					})
				}
				return true
			})
		},
	}),
}))
