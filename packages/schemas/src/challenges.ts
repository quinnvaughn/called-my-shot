import { z } from "zod"
import { PRESSER_REPORT_DETAILS_MAX, PRESSER_REPORT_REASONS } from "./pressers"

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

export const GLOAT_TEXT_MAX = 280

// A GIF as the picker hands it over: what the api needs to show it again
// without asking the provider.
export const gloatGifSchema = z.object({
	id: z.string().min(1),
	url: z.string().url(),
	width: z.number().int().positive(),
	height: z.number().int().positive(),
	alt: z.string().trim().max(200).default(""),
})
export type GloatGif = z.infer<typeof gloatGifSchema>

// Words, a GIF, or both, but not nothing.
export const sendGloatSchema = z
	.object({
		text: z
			.string()
			.trim()
			.max(GLOAT_TEXT_MAX, `Keep it under ${GLOAT_TEXT_MAX} characters`)
			.default(""),
		gif: gloatGifSchema.nullish(),
	})
	.superRefine((input, ctx) => {
		if (input.text.length === 0 && !input.gif) {
			ctx.addIssue({
				code: "custom",
				path: ["text"],
				message: "Say something or pick a GIF",
			})
		}
	})
// What a sender passes: text may be left out when there's a GIF.
export type SendGloatInput = z.input<typeof sendGloatSchema>

export const reportGloatSchema = z.object({
	gloatId: z.string().uuid(),
	reason: z.enum(PRESSER_REPORT_REASONS),
	details: z
		.string()
		.trim()
		.max(
			PRESSER_REPORT_DETAILS_MAX,
			`Keep it under ${PRESSER_REPORT_DETAILS_MAX} characters`,
		)
		.default(""),
})
export type ReportGloatInput = z.input<typeof reportGloatSchema>
