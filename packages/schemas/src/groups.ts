import { z } from "zod"

export const groupNameSchema = z
	.string()
	.trim()
	.min(2, "Group name must be at least 2 characters")
	.max(60, "Group name must be 60 characters or fewer")

export const createGroupSchema = z.object({
	name: groupNameSchema,
})
export type CreateGroupInput = z.infer<typeof createGroupSchema>

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
