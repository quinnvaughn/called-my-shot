import { Store } from "@tanstack/react-store"
import type { PushPromptReason } from "#/lib/analytics"

// The reason a push card is waiting to show, set by the moment that earned it
// (a call, a challenge, joining a group) and taken by PushPromptHost once the
// page that moment leads to has settled. Mirrored to sessionStorage so a
// request made just before a full-page redirect (Google sign-in) survives it.
const STORAGE_KEY = "cms.pushPrompt.pending"

function readStored(): PushPromptReason | null {
	try {
		return (sessionStorage.getItem(STORAGE_KEY) as PushPromptReason) ?? null
	} catch {
		return null
	}
}

export const pushPromptStore = new Store<PushPromptReason | null>(null)

export function requestPushPrompt(reason: PushPromptReason) {
	pushPromptStore.setState(() => reason)
	try {
		sessionStorage.setItem(STORAGE_KEY, reason)
	} catch {}
}

export function takePendingPushPrompt(): PushPromptReason | null {
	const reason = pushPromptStore.state ?? readStored()
	pushPromptStore.setState(() => null)
	try {
		sessionStorage.removeItem(STORAGE_KEY)
	} catch {}
	return reason
}

// Whether the card is on screen, so the walkthrough launcher (same corner,
// same layer) can stand down while it is.
export const pushCardShowingStore = new Store(false)
