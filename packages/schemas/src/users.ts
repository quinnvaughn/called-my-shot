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
//
// An account made through Google has no current password, so for it the
// field is left unchecked and never shown: the same form sets a first one.
export function passwordFormSchema(hasPassword: boolean) {
	return z
		.object({
			currentPassword: hasPassword
				? z.string().min(1, "Current password is required")
				: z.string(),
			newPassword: passwordSchema,
			confirmPassword: z.string().min(1, "Confirm your new password"),
		})
		.refine((v) => v.newPassword === v.confirmPassword, {
			message: "Passwords don't match",
			path: ["confirmPassword"],
		})
}
export const changePasswordFormSchema = passwordFormSchema(true)
export type ChangePasswordFormInput = z.infer<typeof changePasswordFormSchema>

export const deleteAccountSchema = z.object({
	password: z.string().min(1, "Enter your password"),
})
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>

// How many favorite teams one account can list. Enough for a team in every
// league plus a second in a couple, few enough that the profile row stays one
// glance.
export const MAX_FAVORITE_TEAMS = 10

// Duplicates are dropped before the cap is checked, so a repeated id never
// counts twice against it.
export const setFavoriteTeamsSchema = z.object({
	teamIds: z
		.array(z.uuid("That team doesn't exist"))
		.transform((ids) => [...new Set(ids)])
		.pipe(
			z
				.array(z.string())
				.max(MAX_FAVORITE_TEAMS, `Pick up to ${MAX_FAVORITE_TEAMS} teams`),
		),
})
export type SetFavoriteTeamsInput = z.infer<typeof setFavoriteTeamsSchema>
