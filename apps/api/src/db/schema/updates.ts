import { sql } from "drizzle-orm"
import {
	index,
	integer,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core"
import { users } from "./users"

// A product update: an admin-written post announcing a feature, shown at
// /updates/:slug and listed at /updates, and mailed to everyone subscribed
// once an admin sends it.
export const updates = pgTable(
	"updates",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		title: text("title").notNull(),
		// One line, for the /updates list and the email's inbox preview.
		summary: text("summary").notNull(),
		// Markdown. Rendered by the web page and by the email template.
		body: text("body").notNull(),
		// R2 key (see lib/storage.ts), or null for no cover image.
		coverImageKey: text("cover_image_key"),
		// Set on first publish and never changed after, so a link that has
		// gone out in an email keeps working when the title is edited. Null
		// while it's a draft that has never been published.
		slug: text("slug"),
		// Null is a draft: not on the site and can't be mailed.
		publishedAt: timestamp("published_at"),
		// When an admin sent it. One send per update; the rows in
		// update_emails are what actually go out.
		emailedAt: timestamp("emailed_at"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at")
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		uniqueIndex("updates_slug_idx").on(t.slug),
		index("updates_published_idx")
			.on(t.publishedAt)
			.where(sql`published_at is not null`),
	],
)
export type Update = typeof updates.$inferSelect

// One row per (user, update): the send record and the dedupe key, the same
// shape as seasonStartEmails (see db/schema/email.ts).
export const updateEmails = pgTable(
	"update_emails",
	{
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		updateId: uuid("update_id")
			.notNull()
			.references(() => updates.id, { onDelete: "cascade" }),
		sentAt: timestamp("sent_at"),
		// Same meaning as emailOutbox.skippedReason.
		skippedReason: text("skipped_reason"),
		attempts: integer("attempts").notNull().default(0),
		lastError: text("last_error"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [
		primaryKey({ columns: [t.userId, t.updateId] }),
		index("update_emails_pending_idx")
			.on(t.updateId, t.createdAt)
			.where(sql`sent_at is null`),
	],
)
