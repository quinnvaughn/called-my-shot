import { z } from "zod"

// Admin-only input shapes - kept in their own file, separate from the
// public-facing ones in questions.ts/users.ts, since these are only ever
// reachable through requireAdmin-gated mutations.

export const voidReasonSchema = z.enum([
	"nonsensical",
	"off_topic",
	"unsupported_sport",
	"duplicate",
	"other",
])

// countsAsStrike is required from the client, not defaulted here - whether a
// void counts against the asker is a per-void toggle, not hardcoded to the
// reason. The default *state* that toggle opens with (on for
// nonsensical/off_topic/unsupported_sport, off for duplicate/other) is a
// frontend-only concern.
export const voidQuestionSchema = z
	.object({
		questionId: z.string().uuid(),
		reason: voidReasonSchema,
		duplicateOfQuestionId: z.string().uuid().optional(),
		note: z.string().trim().max(500, "Keep it under 500 characters").default(""),
		countsAsStrike: z.boolean(),
	})
	.superRefine((data, ctx) => {
		if (data.reason === "duplicate" && !data.duplicateOfQuestionId) {
			ctx.addIssue({
				code: "custom",
				path: ["duplicateOfQuestionId"],
				message: "Link the question this duplicates",
			})
		}
	})
export type VoidQuestionInput = z.infer<typeof voidQuestionSchema>

// Same shape as resolveQuestionSchema, plus the two source fields an admin
// can overwrite at resolve/overturn time (see adminResolveQuestion and
// overturnDispute) - regular creator resolution never touches these, they're
// set once at question creation and left alone.
export const adminResolveQuestionSchema = z
	.object({
		type: z.enum([
			"multiple_choice",
			"yes_no",
			"over_under",
			"numeric_guess",
			"multi_select",
		]),
		correctOptionIds: z.array(z.string().uuid()).default([]),
		actualValue: z.number().optional(),
		resolutionNote: z.string().trim().max(500, "Keep it under 500 characters").default(""),
		resolutionSource: z.string().trim().optional(),
		resolutionSourceUrl: z
			.string()
			.trim()
			.optional()
			.refine(
				(value) => !value || z.string().url().safeParse(value).success,
				"Enter a valid URL",
			),
	})
	.superRefine((data, ctx) => {
		switch (data.type) {
			case "multiple_choice":
			case "yes_no":
			case "over_under": {
				if (data.correctOptionIds.length !== 1) {
					ctx.addIssue({
						code: "custom",
						path: ["correctOptionIds"],
						message: "Pick exactly one correct option",
					})
				}
				break
			}
			case "multi_select": {
				if (data.correctOptionIds.length < 1) {
					ctx.addIssue({
						code: "custom",
						path: ["correctOptionIds"],
						message: "Pick at least one correct option",
					})
				}
				break
			}
			case "numeric_guess": {
				if (data.actualValue === undefined || Number.isNaN(data.actualValue)) {
					ctx.addIssue({
						code: "custom",
						path: ["actualValue"],
						message: "Enter the actual value",
					})
				}
				break
			}
		}
	})
export type AdminResolveQuestionInput = z.infer<typeof adminResolveQuestionSchema>

export const upholdDisputeSchema = z.object({
	disputeId: z.string().uuid(),
	note: z.string().trim().max(500, "Keep it under 500 characters").default(""),
})
export type UpholdDisputeInput = z.infer<typeof upholdDisputeSchema>
