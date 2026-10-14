import type { PushState } from "#/hooks/use-push-state"

// What the push UI should offer on this device right now.
export type PromptState =
	// Not read yet, or push is switched off on the api.
	| "loading"
	| "enable"
	| "install"
	| "in_app_browser"
	| "on"
	| "denied"
	| "unsupported"

export function promptStateFor(push: PushState): PromptState {
	if (!push.ready || !push.publicKey) return "loading"
	if (push.availability === "in_app_browser") return "in_app_browser"
	if (push.availability === "needs_install") return "install"
	if (push.availability === "unsupported") return "unsupported"
	if (push.permission === "denied") return "denied"
	if (push.subscribed) return "on"
	return "enable"
}

// The states a card after a call, challenge or group join is worth showing in.
export function isOfferState(
	state: PromptState,
): state is "enable" | "install" | "in_app_browser" {
	return state === "enable" || state === "install" || state === "in_app_browser"
}
