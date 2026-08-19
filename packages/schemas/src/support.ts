import { z } from "zod"

export const supportCategorySchema = z.enum([
	"bug",
	"feature_request",
	"call_question",
	"other",
])

export const fileSupportTicketSchema = z.object({
	category: supportCategorySchema,
	subject: z
		.string()
		.trim()
		.min(3, "Give it a short subject")
		.max(120, "Keep the subject under 120 characters"),
	message: z
		.string()
		.trim()
		.min(10, "Say a bit more about what's going on")
		.max(1000, "Keep it under 1000 characters"),
	relatedUrl: z
		.string()
		.trim()
		.default("")
		.refine(
			(value) => value === "" || z.string().url().safeParse(value).success,
			"Enter a valid URL",
		),
})
export type FileSupportTicketInput = z.infer<typeof fileSupportTicketSchema>
