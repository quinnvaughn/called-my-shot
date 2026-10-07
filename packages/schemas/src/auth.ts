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

// An invite code, either carried in from /join/:code or typed into the
// signup form by hand. Optional, and deliberately forgiving: it is uppercased
// and trimmed rather than rejected for case, and an empty string reads as
// absent so a blank optional field never fails a signup. A code that is
// well-formed but unknown is ignored server-side rather than erroring - see
// recordReferralAtSignup.
export const referralCodeSchema = z
	.string()
	.trim()
	.toUpperCase()
	.transform((v) => (v === "" ? undefined : v))
	.optional()

export const signUpSchema = z.object({
	name: nameSchema,
	username: usernameSchema,
	email: emailSchema,
	password: passwordSchema,
	referralCode: referralCodeSchema,
})
export type SignUpInput = z.infer<typeof signUpSchema>

export const signInSchema = z.object({
	identifier: z.string().min(1, "Enter your email or username"),
	password: z.string().min(1, "Enter your password"),
})
export type SignInInput = z.infer<typeof signInSchema>

export const requestPasswordResetSchema = z.object({
	email: emailSchema,
})
export type RequestPasswordResetInput = z.infer<
	typeof requestPasswordResetSchema
>

// Server-facing - the token from the emailed link plus the new password.
export const resetPasswordSchema = z.object({
	token: z.string().min(1, "This reset link is missing its token."),
	newPassword: passwordSchema,
})
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>

// Client-facing - the reset page's two fields. The token comes from the URL,
// and confirmPassword is stripped back off before calling the mutation.
export const resetPasswordFormSchema = z
	.object({
		newPassword: passwordSchema,
		confirmPassword: z.string().min(1, "Confirm your new password"),
	})
	.refine((v) => v.newPassword === v.confirmPassword, {
		message: "Passwords don't match",
		path: ["confirmPassword"],
	})
export type ResetPasswordFormInput = z.infer<typeof resetPasswordFormSchema>
