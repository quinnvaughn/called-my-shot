import { index, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { flairs } from "./flairs"
import { users } from "./users"

// One row per flair a user has been given. Only flairs whose unlock is "grant"
// need one - an "open" flair is equippable with nothing written here, which is
// why this table stays small even though every account can wear a team flair.
//
// The composite primary key is the whole idempotency story, the same one
// achievementNotices tells: the streak pipeline re-detects a 10-run on every
// rebuild of that track, so the grant writer inserts with onConflictDoNothing
// and the insert IS the "have they already got this" check. Nothing has to
// read first, and a rebuild after an overturn can't double-grant.
//
// Deliberately never deleted by a rebuild. A void or a dispute overturn that
// shortens a run leaves the grant standing - see lib/flairs/grant.ts.
export const userFlairs = pgTable(
	"user_flairs",
	{
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		flairId: uuid("flair_id")
			.notNull()
			.references(() => flairs.id, { onDelete: "cascade" }),
		grantedAt: timestamp("granted_at").notNull().defaultNow(),
		// Null when the streak pipeline granted it. Set when a person did: an
		// admin today, and a group admin once group flairs can be assigned.
		grantedByUserId: uuid("granted_by_user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		// Why an admin handed this out. Only ever set alongside grantedByUserId.
		note: text("note"),
	},
	(t) => [
		primaryKey({ columns: [t.userId, t.flairId] }),
		// "who has this flair" - the admin report's direction, and the one the
		// primary key above can't serve.
		index("user_flairs_flair_idx").on(t.flairId),
	],
)
export type UserFlair = typeof userFlairs.$inferSelect
