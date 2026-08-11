import {
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core"
import { users } from "./users"

export const groupMemberRole = pgEnum("group_member_role", ["admin", "member"])

export const groups = pgTable("groups", {
	id: uuid("id").primaryKey().defaultRandom(),
	name: text("name").notNull(),
	createdBy: uuid("created_by")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	createdAt: timestamp("created_at").notNull().defaultNow(),
})

export const groupMembers = pgTable(
	"group_members",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		groupId: uuid("group_id")
			.notNull()
			.references(() => groups.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		role: groupMemberRole("role").notNull().default("member"),
		joinedAt: timestamp("joined_at").notNull().defaultNow(),
	},
	(t) => [unique().on(t.groupId, t.userId)],
)

export const groupInvites = pgTable("group_invites", {
	id: uuid("id").primaryKey().defaultRandom(),
	groupId: uuid("group_id")
		.notNull()
		.references(() => groups.id, { onDelete: "cascade" })
		.unique(),
	code: text("code").notNull().unique(),
	expiresAt: timestamp("expires_at"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
})
