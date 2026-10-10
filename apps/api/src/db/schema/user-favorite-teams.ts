import {
	index,
	integer,
	pgTable,
	primaryKey,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core"
import { teams } from "./teams"
import { users } from "./users"

// The teams a user follows, any number of leagues at once. Separate from
// flair: flair is the single chip worn beside a name, and achievement flairs
// compete for that slot, so it can't double as "who I root for".
//
// Written only by setFavoriteTeams, which replaces the whole list in one
// transaction. That is why position needs no uniqueness constraint: no path
// edits one row in isolation.
export const userFavoriteTeams = pgTable(
	"user_favorite_teams",
	{
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		teamId: uuid("team_id")
			.notNull()
			.references(() => teams.id, { onDelete: "cascade" }),
		// Display order on the profile, 0 first. The order they were picked in.
		position: integer("position").notNull(),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [
		primaryKey({ columns: [t.userId, t.teamId] }),
		// "who follows this team" - the direction a per-team fan count or a
		// homer index reads, and the one the primary key above can't serve.
		index("user_favorite_teams_team_idx").on(t.teamId),
	],
)
export type UserFavoriteTeam = typeof userFavoriteTeams.$inferSelect
