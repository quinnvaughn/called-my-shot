import { Store } from "@tanstack/react-store"

// The invite code someone arrived on, held from /join/:code until there's a
// signup to attach it to.
//
// Held client-side rather than in a cookie because the code has to survive a
// path the server never sees the middle of: land on /join, browse the app
// signed out, make a guest pick or two, and only then open the signup modal.
// Storage is the same mechanism guest picks already use to cross that gap.
//
// It does NOT survive a change of device, which is the attribution this loses
// and the reason the signup form also has a "have a code?" field. The size of
// that loss is visible as the gap between join_page_viewed and
// referral_signup.
export type CapturedReferral = {
	code: string
	// How it arrived, which is the difference between a link that was clicked
	// and a code that was read out loud and typed in.
	source: "invite_link" | "manual_code"
	// When it was captured. A code someone picked up months ago shouldn't
	// still be claiming credit for an account they make much later.
	capturedAt: number
}

const STORAGE_KEY = "cms.referral.v1"

// How long a captured code stays good. Long enough to cover "I'll sign up
// later tonight", short enough that an old link in a browser someone barely
// uses isn't still attributing signups next season.
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

// Starts empty on the server and through hydration, then filled from storage
// on mount - same reasoning as guestPicksStore.
export const referralStore = new Store<CapturedReferral | null>(null)

function readStorage(): CapturedReferral | null {
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY)
		if (!raw) return null
		const parsed: unknown = JSON.parse(raw)
		if (
			typeof parsed === "object" &&
			parsed !== null &&
			"code" in parsed &&
			typeof (parsed as CapturedReferral).code === "string"
		) {
			return parsed as CapturedReferral
		}
		return null
	} catch {
		return null
	}
}

function write(referral: CapturedReferral | null) {
	referralStore.setState(() => referral)
	try {
		if (!referral) window.localStorage.removeItem(STORAGE_KEY)
		else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(referral))
	} catch {
		// Blocked or full storage: the code still holds for this visit.
	}
}

function unexpired(referral: CapturedReferral | null): CapturedReferral | null {
	if (!referral) return null
	return Date.now() - referral.capturedAt <= MAX_AGE_MS ? referral : null
}

// Memory is never staler than storage, since every write goes to both.
function current(): CapturedReferral | null {
	return referralStore.state ?? readStorage()
}

// Called by /join/:code. A later link overwrites an earlier one: the most
// recent invite is the one that actually brought this visit.
export function captureReferral(
	code: string,
	source: CapturedReferral["source"] = "invite_link",
) {
	write({ code: code.trim().toUpperCase(), source, capturedAt: Date.now() })
}

export function restoreReferral(): CapturedReferral | null {
	const referral = unexpired(current())
	if (!referral && current()) write(null)
	return referral
}

// What the signup form should send. Null when nothing was captured, which is
// the front door.
export function readReferral(): CapturedReferral | null {
	return unexpired(current())
}

// Cleared once it has been spent on a signup, so a second account made in the
// same browser isn't credited to the same person again.
export function clearReferral() {
	write(null)
}
