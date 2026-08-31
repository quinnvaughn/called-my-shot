import { z } from "zod"

// Name + league only - sportId and seasonId are always server-derived (see
// createBallot in apps/api/src/graphql/types/ballot.ts), never asked of the
// admin directly.
export const createBallotSchema = z.object({
	name: z.string().trim().min(1, "Name this ballot"),
	leagueId: z.string().uuid("Pick a league"),
})
export type CreateBallotInput = z.infer<typeof createBallotSchema>

// Shared by createQuestion's optional `ballot` param and the standalone
// attachQuestionToBallot mutation - same fields either way a question ends
// up placed into a ballot. label is required (the nav-critical field); slot
// is optional (meaningless for non-positional ballots like a week of games).
export const ballotQuestionSchema = z.object({
	ballotId: z.string().uuid(),
	label: z.string().trim().min(1, "Give this question a label"),
	slot: z.string().trim().max(8, "Keep it short").optional(),
})
export type BallotQuestionInput = z.infer<typeof ballotQuestionSchema>

// attachQuestionToBallot only - same fields as ballotQuestionSchema plus the
// existing question being attached (createQuestion's own `ballot` param never
// needs this - the question doesn't exist yet at parse time there).
export const attachQuestionToBallotSchema = ballotQuestionSchema.extend({
	questionId: z.string().uuid(),
})
export type AttachQuestionToBallotInput = z.infer<
	typeof attachQuestionToBallotSchema
>

// The builder's inline label/slot edit - always resends both fields (the
// row's inputs are bound to current state), so this is a full replace, not a
// partial patch.
export const updateBallotQuestionSchema = z.object({
	questionId: z.string().uuid(),
	label: z.string().trim().min(1, "Give this question a label"),
	slot: z.string().trim().max(8, "Keep it short").optional(),
})
export type UpdateBallotQuestionInput = z.infer<
	typeof updateBallotQuestionSchema
>
