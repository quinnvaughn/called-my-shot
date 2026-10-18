import { z } from "zod"
import { PRESSER_REPORT_DETAILS_MAX, PRESSER_REPORT_REASONS } from "./pressers"

// A comment is someone's own words, a GIF, or both, posted on one thing: a
// challenge's gloat or a chain's thread. Each thing it's posted on adds its
// own rules on who can post and how often; what a comment is stays the same.

export const COMMENT_TEXT_MAX = 280

// A GIF as the picker hands it over: what the api needs to show it again
// without asking the provider.
export const commentGifSchema = z.object({
	id: z.string().min(1),
	url: z.string().url(),
	width: z.number().int().positive(),
	height: z.number().int().positive(),
	alt: z.string().trim().max(200).default(""),
})
export type CommentGif = z.infer<typeof commentGifSchema>

// Words, a GIF, or both, but not nothing.
export const commentSchema = z
	.object({
		text: z
			.string()
			.trim()
			.max(COMMENT_TEXT_MAX, `Keep it under ${COMMENT_TEXT_MAX} characters`)
			.default(""),
		gif: commentGifSchema.nullish(),
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
export type CommentInput = z.input<typeof commentSchema>

export const reportCommentSchema = z.object({
	commentId: z.string().uuid(),
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
export type ReportCommentInput = z.input<typeof reportCommentSchema>
