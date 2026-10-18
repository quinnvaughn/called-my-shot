import type { LinkProps } from "@tanstack/react-router"
import { Store } from "@tanstack/react-store"

// `hash` targets a section within the destination. How It Works reads it to
// open the matching accordion, so a toast can point at one answer rather than
// at a page of closed headers.
export type ToastAction = {
	label: string
	to: LinkProps["to"]
	hash?: string
}

export type Toast = {
	id: number
	message: string
	action?: ToastAction
	// "top" sits under the top bar instead of over the bottom of the page,
	// for a toast landing on a page whose own action is pinned to the bottom
	// (a question's Lock It In bar).
	placement?: "top" | "bottom"
	// On screen this long instead of the default, for a confirmation meant
	// only to be glanced at.
	durationMs?: number
}

// Newest last. ToastHost renders whatever is here; showToast/dismissToast are
// the only writers, the same split as modal-store.
export const toastStore = new Store<Toast[]>([])

// An action gets longer on screen: it's something to read and then decide
// whether to click, not just a confirmation to glance at.
const DURATION_MS = 4000
const DURATION_WITH_ACTION_MS = 7000

// Past this many, the oldest drops off rather than stacking up the screen.
const MAX_VISIBLE = 3

let nextId = 1

export function showToast(toast: Omit<Toast, "id">): number {
	const id = nextId++
	toastStore.setState((toasts) =>
		[...toasts, { ...toast, id }].slice(-MAX_VISIBLE),
	)
	setTimeout(
		() => dismissToast(id),
		toast.durationMs ??
			(toast.action ? DURATION_WITH_ACTION_MS : DURATION_MS),
	)
	return id
}

export function dismissToast(id: number) {
	toastStore.setState((toasts) => toasts.filter((t) => t.id !== id))
}
