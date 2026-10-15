// "forgot" is reached from the sign-in form's link, or opened directly by a
// reset page whose link has expired. It has no tab of its own.
export type AuthModalView = "signin" | "signup" | "forgot"

type AuthModalCopyEntry = {
	title: string
	description: string
}

export type AuthModalCopy = Record<AuthModalView, AuthModalCopyEntry>

export type AuthModalCopyOverride = Partial<
	Record<AuthModalView, Partial<AuthModalCopyEntry>>
>

export type AuthModalSurface = "guest_picks" | "call_page" | "default"
