import { z } from "zod"
import { voidReasonSchema } from "./admin"

// Same values as admin's void reasons on purpose (see questionReports in
// apps/api's schema) - reused directly, not re-declared, so the two can
// never drift apart.
export const reportReasonSchema = voidReasonSchema

export const reportQuestionSchema = z.object({
	questionId: z.string().uuid(),
	reason: reportReasonSchema,
	details: z
		.string()
		.trim()
		.max(500, "Keep it under 500 characters")
		.default(""),
})
export type ReportQuestionInput = z.infer<typeof reportQuestionSchema>
