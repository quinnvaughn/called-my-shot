// Which way this browser last got into an account, so the sign-in screen can
// point at it. Per browser rather than per account because the screen is
// shown before anyone is known: there's no account yet to ask.
export type SignInMethod = "email" | "google"

const STORAGE_KEY = "cms.lastSignIn.v1"

export function rememberSignInMethod(method: SignInMethod) {
	try {
		window.localStorage.setItem(STORAGE_KEY, method)
	} catch {
		// Blocked storage just means no "last used" hint.
	}
}

export function readLastSignInMethod(): SignInMethod | null {
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY)
		return raw === "email" || raw === "google" ? raw : null
	} catch {
		return null
	}
}
