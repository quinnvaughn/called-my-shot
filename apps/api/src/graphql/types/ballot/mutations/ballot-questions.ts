import {
	attachQuestionToBallotSchema,
	updateBallotQuestionSchema,
} from "@called-my-shot/schemas"
import { and, eq } from "drizzle-orm"
import { db } from "../../../../db"
import { RECURRING_QUESTION_CATALOG } from "../../../../db/catalog/recurring-question-catalog"
import { ballotQuestions } from "../../../../db/schema"
import { requireAdmin } from "../../../../lib/auth"
import {
	AuthenticationError,
	AuthorizationError,
	NotFoundError,
	ValidationError,
} from "../../../../lib/errors"
import { getOfficialAccountId } from "../../../../lib/official-account"
import { attachToBallot, writeOrder } from "../../../../lib/questions/ballot"
import { generateSeasonQuestions } from "../../../../lib/season-questions"
import { getCurrentSeason } from "../../../../lib/seasons"
import { builder } from "../../../builder"
import { parseInput } from "../../../helpers"
import {
	AttachQuestionToBallotInput,
	BallotQuestionPayload,
	RegenerateSeasonQuestionsPayload,
	UpdateBallotQuestionInput,
} from "../inputs"

builder.mutationFields((t) => ({
	attachQuestionToBallot: t.field({
		type: BallotQuestionPayload,
		errors: {
			types: [AuthenticationError, AuthorizationError, NotFoundError],
			directResult: true,
			union: { name: "AttachQuestionToBallotResult" },
		},
		args: {
			input: t.arg({ type: AttachQuestionToBallotInput, required: true }),
		},
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const { ballotId, questionId, label, slot, section } = parseInput(
				attachQuestionToBallotSchema,
				args.input,
			)

			const [ballot, question, existing] = await Promise.all([
				db.query.ballots.findFirst({ where: { id: ballotId } }),
				db.query.questions.findFirst({ where: { id: questionId } }),
				db.query.ballotQuestions.findFirst({ where: { questionId } }),
			])
			if (!ballot) throw new NotFoundError("Ballot not found")
			if (!question) throw new NotFoundError("Question not found")
			if (existing) {
				throw ValidationError.field(
					"questionId",
					"This question is already in a ballot",
				)
			}
			if (question.leagueId !== ballot.leagueId) {
				throw ValidationError.field(
					"questionId",
					"Question must be in the same league as the ballot",
				)
			}

			const ballotQuestion = await db.transaction((tx) =>
				attachToBallot(tx, { ballotId, questionId, label, slot, section }),
			)

			return { ballotQuestion }
		},
	}),

	// Removes the question from the ballot only - the question itself is
	// never deleted, same "unlink != delete" precedent as removeGroupMember.
	removeQuestionFromBallot: t.field({
		type: "Boolean",
		errors: {
			types: [AuthenticationError, AuthorizationError],
			union: { name: "RemoveQuestionFromBallotResult" },
		},
		args: { questionId: t.arg.id({ required: true }) },
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			await db
				.delete(ballotQuestions)
				.where(eq(ballotQuestions.questionId, args.questionId))
			return true
		},
	}),

	// Always sends both fields (the builder's row inputs are bound to current
	// state) - a full replace, not a partial patch.
	updateBallotQuestion: t.field({
		type: BallotQuestionPayload,
		errors: {
			types: [AuthenticationError, AuthorizationError, NotFoundError],
			directResult: true,
			union: { name: "UpdateBallotQuestionResult" },
		},
		args: {
			input: t.arg({ type: UpdateBallotQuestionInput, required: true }),
		},
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const data = parseInput(updateBallotQuestionSchema, args.input)

			const [ballotQuestion] = await db
				.update(ballotQuestions)
				.set({
					label: data.label,
					slot: data.slot ?? null,
					section: data.section ?? null,
				})
				.where(eq(ballotQuestions.questionId, data.questionId))
				.returning()
			if (!ballotQuestion)
				throw new NotFoundError("This question isn't in a ballot")
			return { ballotQuestion }
		},
	}),

	// New questions always append to the end (see the sortOrder derivation in
	// attachQuestionToBallot/createQuestion) - this is the only way membership
	// order actually changes, driven by the builder's up/down controls.
	reorderBallotQuestions: t.field({
		type: "Boolean",
		errors: {
			types: [AuthenticationError, AuthorizationError],
			union: { name: "ReorderBallotQuestionsResult" },
		},
		args: {
			ballotId: t.arg.id({ required: true }),
			orderedQuestionIds: t.arg({ type: ["ID"], required: true }),
		},
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const current = await db.query.ballotQuestions.findMany({
				where: { ballotId: args.ballotId },
				columns: { questionId: true },
			})
			await writeOrder({
				currentIds: current.map((r) => r.questionId),
				orderedIds: args.orderedQuestionIds as string[],
				field: "orderedQuestionIds",
				mismatchMessage: "That doesn't match this ballot's current members",
				first: 0,
				setPosition: (tx, questionId, sortOrder) =>
					tx
						.update(ballotQuestions)
						.set({ sortOrder })
						.where(
							and(
								eq(ballotQuestions.ballotId, args.ballotId),
								eq(ballotQuestions.questionId, questionId),
							),
						),
			})
			return true
		},
	}),

	// syncSeasonQuestions runs daily in the cron (db/sync/sync-season-questions
	// .ts) - useful right after a catalog entry is added mid-season, or for
	// testing, rather than waiting for tomorrow's run. Fully idempotent, same
	// as the cron path: safe to call repeatedly, only ever creates what's
	// missing. Attributed to the official account, not the clicking admin -
	// same "byline reads the same no matter who posted it" rule as every other
	// official question (see createQuestion in graphql/types/question/mutations/create-question.ts).
	regenerateSeasonQuestions: t.field({
		type: RegenerateSeasonQuestionsPayload,
		errors: {
			types: [AuthenticationError, AuthorizationError, NotFoundError],
			directResult: true,
			union: { name: "RegenerateSeasonQuestionsResult" },
		},
		args: { leagueId: t.arg.id({ required: true }) },
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)

			const league = await db.query.leagues.findFirst({
				where: { id: args.leagueId },
			})
			if (!league) throw new NotFoundError("League not found")

			const templates = RECURRING_QUESTION_CATALOG[league.slug] ?? []
			if (templates.length === 0) return { created: 0, skipped: 0 }

			const season = await getCurrentSeason(league.id)
			if (!season) return { created: 0, skipped: 0 }

			const officialAccountId = await getOfficialAccountId()
			const result = await generateSeasonQuestions({
				leagueId: league.id,
				resolutionSource: "ESPN / league official sources",
				templates,
				createdBy: officialAccountId,
			})
			return result
		},
	}),
}))
