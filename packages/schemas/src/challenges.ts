import { z } from "zod"

// Enough for every question on one game's card, which the "challenge with
// these picks" shortcut fills in all at once.
export const CHALLENGE_QUESTIONS_MAX = 25

export const createChallengeSchema = z.object({
	questionIds: z
		.array(z.string().uuid())
		.min(1, "Pick at least one question")
		.max(
			CHALLENGE_QUESTIONS_MAX,
			`A challenge holds up to ${CHALLENGE_QUESTIONS_MAX} questions`,
		),
	groupIds: z.array(z.string().uuid()).default([]),
})
export type CreateChallengeInput = z.infer<typeof createChallengeSchema>
