import { useRouter } from "@tanstack/react-router"
import { useEffect } from "react"
import { track } from "#/lib/analytics"
import type { AuthModalSurface } from "#/lib/auth-modal-copy"
import { rememberSignInMethod } from "#/lib/last-sign-in"
import {
	type AuthIntent,
	saveAuthIntent,
	takeAuthIntent,
} from "#/stores/auth-intent-store"
import { markGuestPicksEntry } from "#/stores/guest-picks-store"
import { clearReferral, readReferral } from "#/stores/referral-store"
import { showToast } from "#/stores/toast-store"

// What the page that started a Google sign-in knew and the page it lands back
// on doesn't: which surface the modal was opened from and how the invite code
// arrived, both for the signed-up/signed-in event. Session storage because the
// round trip through Google is one tab's full-page navigation.
const PENDING_KEY = "cms.googleAuth.v1"

type Pending = {
	surface: AuthModalSurface
	referralSource: "invite_link" | "manual_code" | null
}

// Leaves for Google. The captured invite code goes along in the URL, since
// the api can't read this browser's storage and the account is created on
// the far side of the redirect. `intent` is the action the visitor was
// signing up to do, finished by useGoogleAuthReturn once they're back.
export function startGoogleAuth({
	surface,
	returnTo,
	intent,
}: {
	surface: AuthModalSurface
	returnTo: string
	intent: AuthIntent | null
}) {
	saveAuthIntent(intent)
	const referral = readReferral()
	const pending: Pending = {
		surface,
		referralSource: referral?.source ?? null,
	}
	try {
		window.sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending))
	} catch {
		// Blocked storage only costs the event its surface.
	}

	const params = new URLSearchParams({ returnTo })
	if (referral) {
		params.set("ref", referral.code)
		params.set("src", referral.source)
	}
	window.location.assign(`/auth/google?${params.toString()}`)
}

function takePending(): Pending {
	const fallback: Pending = { surface: "default", referralSource: null }
	try {
		const raw = window.sessionStorage.getItem(PENDING_KEY)
		window.sessionStorage.removeItem(PENDING_KEY)
		return raw ? { ...fallback, ...(JSON.parse(raw) as Pending) } : fallback
	} catch {
		return fallback
	}
}

// How long after the page settles the redo toast waits, so it stacks behind
// the username one instead of arriving alongside it.
const REDO_TOAST_DELAY_MS = 600

// Runs once on the page a Google sign-in returns to. The api reports how it
// went in the query string; this reads it, does what the auth modal does on a
// normal signup, and strips the params so a refresh doesn't do it twice. An
// intent saved before leaving goes to `resume`, the same way an email form's
// onSuccess runs the gated action. Only on a return that signed someone in, so
// an intent from a trip that was abandoned or failed never fires.
export function useGoogleAuthReturn(
	username: string | null,
	resume: (intent: AuthIntent) => void,
) {
	const router = useRouter()

	// biome-ignore lint/correctness/useExhaustiveDependencies: one arrival per page load
	useEffect(() => {
		const url = new URL(window.location.href)
		const auth = url.searchParams.get("auth")
		const authError = url.searchParams.get("authError")
		const redo = url.searchParams.get("redo") === "1"
		if (!auth && !authError) return

		for (const key of ["auth", "authError", "redo"]) {
			url.searchParams.delete(key)
		}
		router.history.replace(`${url.pathname}${url.search}${url.hash}`)

		const intent = takeAuthIntent()

		if (authError) {
			takePending()
			showToast({ message: "Google sign-in didn't go through. Try again." })
			return
		}

		const { surface, referralSource } = takePending()
		if (auth === "google_signin" || auth === "google_signup") {
			rememberSignInMethod("google")
		}

		if (auth === "google_signin") {
			track("user_signed_in", { method: "google", surface })
			markGuestPicksEntry("signin")
			if (intent) resume(intent)
			return
		}

		if (auth !== "google_signup") return

		track("user_signed_up", { method: "google", surface, referralSource })
		// Spent, the same as after an email signup.
		clearReferral()
		markGuestPicksEntry("signup")
		if (intent) resume(intent)

		if (username) {
			showToast({
				message: `You're @${username}. You can change it anytime in settings.`,
				action: { label: "Change it", to: "/settings" },
			})
		}
		if (redo) {
			setTimeout(() => {
				showToast({
					message:
						"You've got a redo. It can change one call before that question locks.",
					action: {
						label: "What's a redo?",
						to: "/how-it-works",
						hash: "redos",
					},
				})
			}, REDO_TOAST_DELAY_MS)
		}
	}, [])
}
