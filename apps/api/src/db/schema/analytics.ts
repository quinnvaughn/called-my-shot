import { sql } from "drizzle-orm"
import {
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core"
import { users } from "./users"

// Product analytics events that happen on the server, queued for
// lib/analytics-outbox.ts to deliver to PostHog. Most events are captured in
// the browser, but some moments have no browser behind them: a call settles
// when ESPN's box score lands or a dispute is overturned, usually while the
// caller is nowhere near the app. Queued rather than sent inline for the same
// reason emailOutbox is: the writers run inside a transaction, so an inline
// send would fire before commit and again on retry.
export const analyticsOutbox = pgTable(
	"analytics_outbox",
	{
		// Doubles as the PostHog event uuid, so a batch that was delivered but
		// whose response never came back is deduplicated on the retry.
		id: uuid("id").primaryKey().defaultRandom(),
		// The PostHog distinct_id, which is the same user id the web app
		// identifies with. Cascade, so a deleted account's unsent events go
		// with it.
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		event: text("event").notNull(),
		properties: jsonb("properties").notNull(),
		// Sent as the event's timestamp, so a backlog delivered late still lands
		// on the moment it happened.
		createdAt: timestamp("created_at").notNull().defaultNow(),
		sentAt: timestamp("sent_at"),
		attempts: integer("attempts").notNull().default(0),
		lastError: text("last_error"),
	},
	(t) => [
		index("analytics_outbox_pending_idx")
			.on(t.createdAt)
			.where(sql`sent_at is null`),
	],
)
export type AnalyticsOutboxRow = typeof analyticsOutbox.$inferSelect
