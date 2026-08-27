import { z } from "zod"

// Name + league only - sportId and seasonId are always server-derived (see
// createSlate in apps/api/src/graphql/types/slate.ts), never asked of the
// admin directly.
export const createSlateSchema = z.object({
	name: z.string().trim().min(1, "Name this slate"),
	leagueId: z.string().uuid("Pick a league"),
})
export type CreateSlateInput = z.infer<typeof createSlateSchema>

// Shared by createQuestion's optional `slate` param and the standalone
// attachQuestionToSlate mutation - same fields either way a question ends
// up placed into a slate. label is required (the nav-critical field); slot
// is optional (meaningless for non-positional slates like a week of games).
export const slateQuestionSchema = z.object({
	slateId: z.string().uuid(),
	label: z.string().trim().min(1, "Give this question a label"),
	slot: z.string().trim().max(8, "Keep it short").optional(),
})
export type SlateQuestionInput = z.infer<typeof slateQuestionSchema>

// attachQuestionToSlate only - same fields as slateQuestionSchema plus the
// existing question being attached (createQuestion's own `slate` param never
// needs this - the question doesn't exist yet at parse time there).
export const attachQuestionToSlateSchema = slateQuestionSchema.extend({
	questionId: z.string().uuid(),
})
export type AttachQuestionToSlateInput = z.infer<
	typeof attachQuestionToSlateSchema
>

// The builder's inline label/slot edit - always resends both fields (the
// row's inputs are bound to current state), so this is a full replace, not a
// partial patch.
export const updateSlateQuestionSchema = z.object({
	questionId: z.string().uuid(),
	label: z.string().trim().min(1, "Give this question a label"),
	slot: z.string().trim().max(8, "Keep it short").optional(),
})
export type UpdateSlateQuestionInput = z.infer<typeof updateSlateQuestionSchema>
