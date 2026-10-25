import {
	index,
	pgEnum,
	pgTable,
	primaryKey,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core"
import { users } from "./users"

export const followTargetKind = pgEnum("follow_target_kind", [
	"user",
	"league",
	"team",
	"player",
])
export type FollowTargetKind = (typeof followTargetKind.enumValues)[number]

// What someone follows: other people, and the spaces they want in their Home
// feed. One-way, never mutual - following isn't friending.
//
// Separate from user_favorite_teams, which is who someone roots for and shows
// on their profile. Following a rival is normal. Picking favorites does add
// follows for those teams and their leagues (see lib/follows), since a fan
// wants their team in their feed.
//
// targetId points into users, leagues, teams or players depending on
// targetKind, so there's no FK - the same trade-off as post_tags.spaceId.
export const follows = pgTable(
	"follows",
	{
		followerId: uuid("follower_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		targetKind: followTargetKind("target_kind").notNull(),
		targetId: uuid("target_id").notNull(),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [
		primaryKey({ columns: [t.followerId, t.targetKind, t.targetId] }),
		index("follows_target_idx").on(t.targetKind, t.targetId),
	],
)
export type Follow = typeof follows.$inferSelect
