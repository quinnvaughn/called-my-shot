import { z } from "zod"

export const userNameSchema = z
	.string()
	.trim()
	.min(2, "Name must be at least 2 characters")
	.max(60, "Name must be 60 characters or fewer")

export const updateNameSchema = z.object({
	name: userNameSchema,
})
export type UpdateNameInput = z.infer<typeof updateNameSchema>
