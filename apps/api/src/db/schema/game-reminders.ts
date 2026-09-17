import { sql } from "drizzle-orm"
import {
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core"
import { games } from "./games"
import { users } from "./users"

// One row per (user, game) someone asked to be reminded about, drained by
// lib/game-reminders.tsx an hour before the game starts. There is no due time
// column on purpose: the drain reads games.startsAt when it runs, so a
// rescheduled game carries its reminders along instead of firing at the old
// time.
//
// The row is both the "reminder is on" state the game page reads and the send
// record, the way seasonStartEmails is (db/schema/email.ts). Removing a
// reminder deletes the unsent row; a sent one stays as the record of it.
export const gameReminders = pgTable(
	"game_reminders",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		gameId: uuid("game_id")
			.notNull()
			.references(() => games.id, { onDelete: "cascade" }),
		sentAt: timestamp("sent_at"),
		// Stamped alongside sentAt when the reminder finished without an email:
		// "muted" still created the in-app notification, "game_started" sent
		// nothing because the game was no longer ahead by the time it was drained.
		skippedReason: text("skipped_reason"),
		attempts: integer("attempts").notNull().default(0),
		lastError: text("last_error"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [
		uniqueIndex("game_reminders_user_game_idx").on(t.userId, t.gameId),
		index("game_reminders_pending_idx")
			.on(t.gameId)
			.where(sql`sent_at is null`),
	],
)
export type GameReminder = typeof gameReminders.$inferSelect
