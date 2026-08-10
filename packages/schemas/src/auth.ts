import { z } from "zod"

export const emailSchema = z.email("Enter a valid email address")

export const passwordSchema = z.string().min(8, "At least 8 characters")

export const nameSchema = z
	.string()
	.trim()
	.min(1, "Name is required")
	.max(80, "Name must be 80 characters or fewer")

export const usernameSchema = z
	.string()
	.trim()
	.toLowerCase()
	.min(3, "Username must be at least 3 characters")
	.max(24, "Username must be 24 characters or fewer")
	.regex(
		/^[a-z0-9_]+$/,
		"Username can only contain letters, numbers, and underscores",
	)

export const signUpSchema = z.object({
	name: nameSchema,
	username: usernameSchema,
	email: emailSchema,
	password: passwordSchema,
})
export type SignUpInput = z.infer<typeof signUpSchema>

export const signInSchema = z.object({
	identifier: z.string().min(1, "Enter your email or username"),
	password: z.string().min(1, "Enter your password"),
})
export type SignInInput = z.infer<typeof signInSchema>
