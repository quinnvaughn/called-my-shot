import { z } from "zod"

// Name + league only - sportId and seasonId are always server-derived (see
// createBallot in apps/api/src/graphql/types/ballot/mutations/ballot.ts), never asked of the
// admin directly.
export const createBallotSchema = z.object({
	name: z.string().trim().min(1, "Name this ballot"),
	leagueId: z.string().uuid("Pick a league"),
})
export type CreateBallotInput = z.infer<typeof createBallotSchema>

// Shared by createQuestion's optional `ballot` param and the standalone
// attachQuestionToBallot mutation - same fields either way a question ends
// up placed into a ballot. label is required (the nav-critical field); slot
// and section are optional (both meaningless for non-positional, ungrouped
// ballots like a week of games).
export const ballotQuestionSchema = z.object({
	ballotId: z.string().uuid(),
	label: z.string().trim().min(1, "Give this question a label"),
	slot: z.string().trim().max(8, "Keep it short").optional(),
	section: z.string().trim().max(40, "Keep it short").optional(),
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

// The builder's inline label/slot/section edit - always resends every field
// (the row's inputs are bound to current state), so this is a full replace,
// not a partial patch. An emptied input arrives as undefined and clears the
// column, which is how a section gets removed.
export const updateBallotQuestionSchema = z.object({
	questionId: z.string().uuid(),
	label: z.string().trim().min(1, "Give this question a label"),
	slot: z.string().trim().max(8, "Keep it short").optional(),
	section: z.string().trim().max(40, "Keep it short").optional(),
})
export type UpdateBallotQuestionInput = z.infer<
	typeof updateBallotQuestionSchema
>

// A run of win-total picks the user gave the same number, in the order they
// want them to finish in their projected standings - first is highest.
export const setBallotTiebreakOrderSchema = z.object({
	ballotId: z.string().uuid(),
	questionIds: z
		.array(z.string().uuid())
		.min(2, "Only tied teams need an order")
		.refine((ids) => new Set(ids).size === ids.length, "A team is listed twice"),
})
export type SetBallotTiebreakOrderInput = z.infer<
	typeof setBallotTiebreakOrderSchema
>

// A win-totals ballot's Rebalance: new numbers for some of the user's picks,
// checked against the schedule's total server-side (rebalanceProblem in
// apps/api/src/lib/rebalance.ts).
export const rebalanceWinTotalsSchema = z.object({
	ballotId: z.string().uuid(),
	changes: z
		.array(
			z.object({
				questionId: z.string().uuid(),
				guessValue: z.number(),
			}),
		)
		.min(1, "Change at least one pick"),
})
export type RebalanceWinTotalsInput = z.infer<typeof rebalanceWinTotalsSchema>
