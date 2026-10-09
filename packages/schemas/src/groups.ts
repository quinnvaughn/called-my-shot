import { z } from "zod"
import { linksSchema } from "./links"

export const groupNameSchema = z
	.string()
	.trim()
	.min(2, "Group name must be at least 2 characters")
	.max(60, "Group name must be 60 characters or fewer")

export const GROUP_DESCRIPTION_MAX = 200

// Optional - a blank description is saved as none (the api stores null).
export const groupDescriptionSchema = z
	.string()
	.trim()
	.max(
		GROUP_DESCRIPTION_MAX,
		`Description must be ${GROUP_DESCRIPTION_MAX} characters or fewer`,
	)

// Empty means the group tracks every league.
export const trackedLeagueIdsSchema = z
	.array(z.string().uuid("Pick leagues from the list"))
	.transform((ids) => [...new Set(ids)])

export const createGroupSchema = z.object({
	name: groupNameSchema,
	description: groupDescriptionSchema.optional(),
	leagueIds: trackedLeagueIdsSchema.default([]),
})
export type CreateGroupInput = z.infer<typeof createGroupSchema>

export const updateGroupSchema = z.object({
	groupId: z.string().uuid(),
	name: groupNameSchema,
	description: groupDescriptionSchema,
	leagueIds: trackedLeagueIdsSchema,
})
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>

// The whole set, in display order. Empty clears them.
export const updateGroupLinksSchema = z.object({
	groupId: z.string().uuid(),
	links: linksSchema,
})
export type UpdateGroupLinksInput = z.input<typeof updateGroupLinksSchema>

// How many still-callable questions a group can have pinned at once.
export const GROUP_PINS_MAX = 3

export const groupPinSchema = z.object({
	groupId: z.string().uuid(),
	questionId: z.string().uuid(),
})

// How many ballots a group can have on its page at once. They stay through
// resolution until an admin removes them, so this counts settled ones too.
export const GROUP_BALLOTS_MAX = 5

export const groupBallotSchema = z.object({
	groupId: z.string().uuid(),
	ballotId: z.string().uuid(),
})

// The group's current callable pins, in their new display order. Each id is
// the pinned question's.
export const setGroupPinOrderSchema = z.object({
	groupId: z.string().uuid(),
	pinIds: z.array(z.string().uuid()).max(GROUP_PINS_MAX),
})

export const inviteCodeSchema = z
	.string()
	.trim()
	.toUpperCase()
	.min(4, "Enter a valid invite code")
	.max(10, "Enter a valid invite code")

export const joinGroupSchema = z.object({
	code: inviteCodeSchema,
})
export type JoinGroupInput = z.infer<typeof joinGroupSchema>
