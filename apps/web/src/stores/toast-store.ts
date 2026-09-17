import type { LinkProps } from "@tanstack/react-router"
import { Store } from "@tanstack/react-store"

export type ToastAction = { label: string; to: LinkProps["to"] }

export type Toast = {
	id: number
	message: string
	action?: ToastAction
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
		toast.action ? DURATION_WITH_ACTION_MS : DURATION_MS,
	)
	return id
}

export function dismissToast(id: number) {
	toastStore.setState((toasts) => toasts.filter((t) => t.id !== id))
}
