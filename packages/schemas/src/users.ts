import { z } from "zod"
import { emailSchema, passwordSchema, usernameSchema } from "./auth"

export const userNameSchema = z
	.string()
	.trim()
	.min(2, "Name must be at least 2 characters")
	.max(60, "Name must be 60 characters or fewer")

export const updateNameSchema = z.object({
	name: userNameSchema,
})
export type UpdateNameInput = z.infer<typeof updateNameSchema>

export const updateUsernameSchema = z.object({
	username: usernameSchema,
})
export type UpdateUsernameInput = z.infer<typeof updateUsernameSchema>

export const requestEmailChangeSchema = z.object({
	newEmail: emailSchema,
	password: z.string().min(1, "Enter your password"),
})
export type RequestEmailChangeInput = z.infer<typeof requestEmailChangeSchema>

// Server-facing - just what actually gets persisted.
export const updatePasswordSchema = z.object({
	currentPassword: z.string().min(1, "Current password is required"),
	newPassword: passwordSchema,
})
export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>

// Client-facing - adds the confirm field and the cross-field match check.
// The form strips confirmPassword back off before calling the mutation.
export const changePasswordFormSchema = z
	.object({
		currentPassword: z.string().min(1, "Current password is required"),
		newPassword: passwordSchema,
		confirmPassword: z.string().min(1, "Confirm your new password"),
	})
	.refine((v) => v.newPassword === v.confirmPassword, {
		message: "Passwords don't match",
		path: ["confirmPassword"],
	})
export type ChangePasswordFormInput = z.infer<typeof changePasswordFormSchema>

export const deleteAccountSchema = z.object({
	password: z.string().min(1, "Enter your password"),
})
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>
