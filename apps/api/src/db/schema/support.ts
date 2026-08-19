import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { users } from "./users"

export const supportCategory = pgEnum("support_category", [
	"bug",
	"feature_request",
	"call_question",
	"other",
])

export const supportTicketStatus = pgEnum("support_ticket_status", [
	"open",
	"closed",
])

export const supportTickets = pgTable("support_tickets", {
	id: uuid("id").primaryKey().defaultRandom(),
	userId: uuid("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	category: supportCategory("category").notNull(),
	subject: text("subject").notNull(),
	message: text("message").notNull(),
	relatedUrl: text("related_url"),
	status: supportTicketStatus("status").notNull().default("open"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	resolvedAt: timestamp("resolved_at"),
})
export type SupportTicket = typeof supportTickets.$inferSelect
