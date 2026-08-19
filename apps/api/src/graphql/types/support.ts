import { fileSupportTicketSchema } from "@called-my-shot/schemas"
import { db } from "../../db"
import { supportTickets } from "../../db/schema"
import { env } from "../../env"
import { requireUser } from "../../lib/auth"
import { AuthenticationError, ValidationError } from "../../lib/errors"
import { sendMail } from "../../lib/mailer"
import { builder } from "../builder"

const SupportCategory = builder.enumType("SupportCategory", {
	values: {
		BUG: { value: "bug" },
		FEATURE_REQUEST: { value: "feature_request" },
		CALL_QUESTION: { value: "call_question" },
		OTHER: { value: "other" },
	},
})

const FileSupportTicketInput = builder.inputType("FileSupportTicketInput", {
	fields: (t) => ({
		category: t.field({ type: SupportCategory, required: true }),
		subject: t.string({ required: true }),
		message: t.string({ required: true }),
		relatedUrl: t.string({ required: false }),
	}),
})

// Narrow on purpose - nothing queries tickets yet (no admin list, no "my
// tickets" view), so this only exposes what the post-submit confirmation
// screen needs rather than standing up a full drizzleObject + relations.
const FileSupportTicketPayload = builder
	.objectRef<{ id: string; createdAt: Date }>("FileSupportTicketPayload")
	.implement({
		fields: (t) => ({
			id: t.exposeID("id"),
			createdAt: t.field({
				type: "String",
				resolve: (ticket) => ticket.createdAt.toISOString(),
			}),
		}),
	})

builder.mutationFields((t) => ({
	fileSupportTicket: t.field({
		type: FileSupportTicketPayload,
		errors: {
			types: [AuthenticationError, ValidationError],
			directResult: true,
			union: { name: "FileSupportTicketResult" },
		},
		args: { input: t.arg({ type: FileSupportTicketInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const parsed = fileSupportTicketSchema.safeParse(args.input)
			if (!parsed.success) {
				throw ValidationError.fromZodIssues(parsed.error.issues)
			}
			const data = parsed.data

			const [ticket] = await db
				.insert(supportTickets)
				.values({
					userId: user.id,
					category: data.category,
					subject: data.subject,
					message: data.message,
					relatedUrl: data.relatedUrl || null,
					status: "open",
				})
				.returning()

			// No email provider is wired up yet (sendMail just logs) - an outage
			// there shouldn't fail the mutation, the ticket row is already the
			// source of truth.
			void sendMail(
				env.SUPPORT_EMAIL,
				`[Support] ${data.category}: ${data.subject}`,
				`From: ${user.email} (@${user.username})\nCategory: ${data.category}\nRelated URL: ${data.relatedUrl || "-"}\n\n${data.message}\n\nTicket: ${ticket.id}`,
			)

			return ticket
		},
	}),
}))
