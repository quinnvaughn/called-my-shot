import { z } from "zod"

// The presser rules people are told about (see the How it works page), kept
// here so the api enforcing them and the page stating them can't disagree.

// How long a presser takes questions and answers after it opens.
export const PRESSER_WINDOW_HOURS = 48
// The most questions one presser takes from people who don't share a group
// with the owner. Groupmates have no cap beyond one question each.
export const STRANGER_QUESTION_CAP = 5
// What an account needs before it can ask someone it doesn't share a group
// with, so a fresh throwaway can't.
export const MIN_ACCOUNT_AGE_DAYS = 7
export const MIN_SETTLED_CALLS = 10

export const PRESSER_STATEMENT_MAX = 600
export const PRESSER_QUESTION_MAX = 280
export const PRESSER_ANSWER_MAX = 600
export const PRESSER_REPORT_DETAILS_MAX = 500

export const postPresserStatementSchema = z.object({
	presserId: z.string().uuid(),
	text: z
		.string()
		.trim()
		.min(1, "Say something, or skip the statement")
		.max(
			PRESSER_STATEMENT_MAX,
			`Keep it under ${PRESSER_STATEMENT_MAX} characters`,
		),
})
export type PostPresserStatementInput = z.infer<
	typeof postPresserStatementSchema
>

export const askPresserQuestionSchema = z.object({
	presserId: z.string().uuid(),
	body: z
		.string()
		.trim()
		.min(1, "Ask something")
		.max(
			PRESSER_QUESTION_MAX,
			`Keep it under ${PRESSER_QUESTION_MAX} characters`,
		),
})
export type AskPresserQuestionInput = z.infer<typeof askPresserQuestionSchema>

// Either a written answer or "No comment", never both.
export const answerPresserQuestionSchema = z
	.object({
		questionId: z.string().uuid(),
		answer: z
			.string()
			.trim()
			.max(PRESSER_ANSWER_MAX, `Keep it under ${PRESSER_ANSWER_MAX} characters`)
			.default(""),
		noComment: z.boolean().default(false),
	})
	.superRefine((input, ctx) => {
		if (input.noComment && input.answer.length > 0) {
			ctx.addIssue({
				code: "custom",
				path: ["answer"],
				message: "Answer it or pass on it, not both",
			})
		}
		if (!input.noComment && input.answer.length === 0) {
			ctx.addIssue({
				code: "custom",
				path: ["answer"],
				message: "Write an answer, or pick No comment",
			})
		}
	})
export type AnswerPresserQuestionInput = z.infer<
	typeof answerPresserQuestionSchema
>

export const PRESSER_REPORT_TARGETS = [
	"question",
	"answer",
	"statement",
] as const
export type PresserReportTarget = (typeof PRESSER_REPORT_TARGETS)[number]

export const PRESSER_REPORT_REASONS = [
	"harassment",
	"hate",
	"threat",
	"sexual",
	"personal_info",
	"spam",
	"other",
] as const
export type PresserReportReason = (typeof PRESSER_REPORT_REASONS)[number]

export const PRESSER_REPORT_REASON_LABELS: Record<PresserReportReason, string> =
	{
		harassment: "Harassment or bullying",
		hate: "Hate or slurs",
		threat: "A threat",
		sexual: "Sexual content about a real person",
		personal_info: "Someone's personal info",
		spam: "Spam",
		other: "Something else",
	}

// A statement report names the presser; a question or answer report names
// the question it's on.
export const reportPresserContentSchema = z
	.object({
		presserId: z.string().uuid(),
		presserQuestionId: z.string().uuid().nullish(),
		target: z.enum(PRESSER_REPORT_TARGETS),
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
	.superRefine((input, ctx) => {
		const needsQuestion = input.target !== "statement"
		if (needsQuestion && !input.presserQuestionId) {
			ctx.addIssue({
				code: "custom",
				path: ["presserQuestionId"],
				message: "Pick the question to report",
			})
		}
		if (!needsQuestion && input.presserQuestionId) {
			ctx.addIssue({
				code: "custom",
				path: ["presserQuestionId"],
				message: "A statement report doesn't name a question",
			})
		}
	})
export type ReportPresserContentInput = z.infer<
	typeof reportPresserContentSchema
>
