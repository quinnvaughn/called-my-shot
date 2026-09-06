import type { Ballot, BallotQuestion } from "../../../db/schema"
import { builder } from "../../builder"
import { BallotQuestionRef, BallotRef } from "./refs"

export const BallotPayload = builder
	.objectRef<{ ballot: Ballot }>("BallotPayload")
	.implement({
		fields: (t) => ({
			ballot: t.field({
				type: BallotRef,
				resolve: (payload) => payload.ballot,
			}),
		}),
	})

export const RegenerateSeasonQuestionsPayload = builder
	.objectRef<{ created: number; skipped: number }>(
		"RegenerateSeasonQuestionsPayload",
	)
	.implement({
		fields: (t) => ({
			created: t.exposeInt("created"),
			skipped: t.exposeInt("skipped"),
		}),
	})

export const BallotQuestionPayload = builder
	.objectRef<{ ballotQuestion: BallotQuestion }>("BallotQuestionPayload")
	.implement({
		fields: (t) => ({
			ballotQuestion: t.field({
				type: BallotQuestionRef,
				resolve: (payload) => payload.ballotQuestion,
			}),
		}),
	})

export const CreateBallotInput = builder.inputType("CreateBallotInput", {
	fields: (t) => ({
		name: t.string({ required: true }),
		leagueId: t.id({ required: true }),
	}),
})

// Also used as createQuestion's optional `ballot` param (see
// CreateQuestionInput in question.ts) - a question being created has no id
// yet, so this never carries a questionId itself.
export const BallotQuestionInput = builder.inputType("BallotQuestionInput", {
	fields: (t) => ({
		ballotId: t.id({ required: true }),
		label: t.string({ required: true }),
		slot: t.string({ required: false }),
		section: t.string({ required: false }),
	}),
})

export const AttachQuestionToBallotInput = builder.inputType(
	"AttachQuestionToBallotInput",
	{
		fields: (t) => ({
			ballotId: t.id({ required: true }),
			questionId: t.id({ required: true }),
			label: t.string({ required: true }),
			slot: t.string({ required: false }),
			section: t.string({ required: false }),
		}),
	},
)

export const UpdateBallotQuestionInput = builder.inputType(
	"UpdateBallotQuestionInput",
	{
		fields: (t) => ({
			questionId: t.id({ required: true }),
			label: t.string({ required: true }),
			slot: t.string({ required: false }),
			section: t.string({ required: false }),
		}),
	},
)
