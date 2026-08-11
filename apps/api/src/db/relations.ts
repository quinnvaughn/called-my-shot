import { defineRelations } from "drizzle-orm"
import * as schema from "./schema"

export const relations = defineRelations(schema, (r) => ({
	users: {
		sessions: r.many.sessions(),
		groupsCreated: r.many.groups({
			from: r.users.id,
			to: r.groups.createdBy,
		}),
		groupMemberships: r.many.groupMembers(),
	},
	sessions: {
		user: r.one.users({
			from: r.sessions.userId,
			to: r.users.id,
		}),
	},
	groups: {
		creator: r.one.users({
			from: r.groups.createdBy,
			to: r.users.id,
		}),
		members: r.many.groupMembers(),
		invite: r.one.groupInvites({
			from: r.groups.id,
			to: r.groupInvites.groupId,
		}),
	},
	groupMembers: {
		group: r.one.groups({
			from: r.groupMembers.groupId,
			to: r.groups.id,
		}),
		user: r.one.users({
			from: r.groupMembers.userId,
			to: r.users.id,
		}),
	},
	groupInvites: {
		group: r.one.groups({
			from: r.groupInvites.groupId,
			to: r.groups.id,
		}),
	},
}))
