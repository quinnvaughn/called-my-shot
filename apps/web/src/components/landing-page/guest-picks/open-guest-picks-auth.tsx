import { AuthModal, type AuthModalView } from "#/components/auth/auth-modal"
import { track } from "#/lib/analytics"
import { pluralize } from "#/lib/pluralize"
import { openModal } from "#/stores/modal-store"

// Where on the landing page the visitor asked to sign up from: under the card
// they just called, or the bar that follows them down the page on mobile.
export type GuestPicksAuthSource = "card" | "lock_bar"

// Signing up (or in) from here needs no onSuccess of its own: AuthModal lands
// everyone on Home, which posts whatever is waiting in guest-picks-store.
export function openGuestPicksAuth(
	view: AuthModalView,
	pickCount: number,
	source: GuestPicksAuthSource,
) {
	const one = pickCount === 1
	track("guest_picks_signup_opened", { pickCount, source })
	openModal(
		<AuthModal
			defaultView={view}
			surface="guest_picks"
			copy={{
				signup: {
					title: one ? "Lock in your call" : `Lock in your ${pickCount} calls`,
					description: `${one ? "It counts" : "They count"} as soon as your account exists. Free, about 30 seconds.`,
				},
				signin: {
					title: one ? "Sign in to lock it in" : "Sign in to lock these in",
					description: `Your ${pickCount} ${pluralize(pickCount, "call")} ${one ? "posts" : "post"} the moment you're in.`,
				},
			}}
		/>,
	)
}

// The primary button's label wherever the stack asks for a sign-up.
export function lockInLabel(pickCount: number) {
	return pickCount === 1
		? "Sign up to lock it in"
		: `Sign up to lock in ${pickCount} calls`
}
