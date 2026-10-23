import { eq } from "drizzle-orm"
import { db } from "../../../db"
import { groupMembers, type User, users } from "../../../db/schema"

// Everyone in a group, for the arcade games' boards.
export async function loadGroupMemberUsers(groupId: string): Promise<User[]> {
	const rows = await db
		.select({ user: users })
		.from(groupMembers)
		.innerJoin(users, eq(users.id, groupMembers.userId))
		.where(eq(groupMembers.groupId, groupId))
	return rows.map((r) => r.user)
}
