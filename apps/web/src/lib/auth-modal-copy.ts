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

// Where the modal was opened from, recorded on the signed-up/signed-in event.
// start_group is the landing page's pre-signup group form; group_invite is a
// group's invite link; season_puzzle and blind_rank are the next steps under
// a finished arcade game.
export type AuthModalSurface =
	| "season_puzzle"
	| "blind_rank"
	| "guest_picks"
	| "call_page"
	| "start_group"
	| "group_invite"
	| "default"
