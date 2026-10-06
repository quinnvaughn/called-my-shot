import { setBallotTiebreakOrderSchema } from "@called-my-shot/schemas"
import { sql } from "drizzle-orm"
import { db } from "../../../../db"
import { ballotTiebreaks } from "../../../../db/schema"
import { requireUser } from "../../../../lib/auth"
import {
	AuthenticationError,
	NotFoundError,
	ValidationError,
} from "../../../../lib/errors"
import { builder } from "../../../builder"
import { parseInput } from "../../../helpers"

builder.mutationFields((t) => ({
	// Orders a run of the viewer's own win-total picks that share a number, for
	// the projected standings view. Positions are written 0..n-1 for exactly
	// the questions given; they're only ever compared within one tie, so other
	// rows are left alone. Locks with the picks themselves.
	setBallotTiebreakOrder: t.field({
		type: "Boolean",
		errors: {
			types: [AuthenticationError, NotFoundError],
			union: { name: "SetBallotTiebreakOrderResult" },
		},
		args: {
			ballotId: t.arg.id({ required: true }),
			questionIds: t.arg({ type: ["ID"], required: true }),
		},
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const data = parseInput(setBallotTiebreakOrderSchema, args)

			const ballot = await db.query.ballots.findFirst({
				where: { id: data.ballotId, status: "published" },
				columns: { id: true },
			})
			if (!ballot) throw new NotFoundError("Ballot not found")

			const members = await db.query.ballotQuestions.findMany({
				where: { ballotId: ballot.id, questionId: { in: data.questionIds } },
				columns: { questionId: true },
				with: { question: { columns: { status: true, locksAt: true } } },
			})
			if (members.length !== data.questionIds.length) {
				throw ValidationError.field(
					"questionIds",
					"Those teams aren't all on this ballot",
				)
			}
			// Same real-clock check as castCall: status can lag locksAt.
			const now = new Date()
			if (
				members.some(
					(m) => m.question?.status !== "open" || m.question.locksAt <= now,
				)
			) {
				throw ValidationError.field(null, "These picks are locked.")
			}

			const userCalls = await db.query.calls.findMany({
				where: { userId: user.id, questionId: { in: data.questionIds } },
				columns: { guessValue: true },
			})
			const guesses = new Set(userCalls.map((c) => c.guessValue))
			if (
				userCalls.length !== data.questionIds.length ||
				guesses.size !== 1 ||
				guesses.has(null)
			) {
				throw ValidationError.field(
					"questionIds",
					"Only teams you gave the same win total can be ordered",
				)
			}

			await db
				.insert(ballotTiebreaks)
				.values(
					data.questionIds.map((questionId, position) => ({
						ballotId: ballot.id,
						userId: user.id,
						questionId,
						position,
					})),
				)
				.onConflictDoUpdate({
					target: [
						ballotTiebreaks.ballotId,
						ballotTiebreaks.userId,
						ballotTiebreaks.questionId,
					],
					set: {
						position: sql`excluded.position`,
						updatedAt: sql`now()`,
					},
				})
			return true
		},
	}),
}))
