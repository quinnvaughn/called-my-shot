import { Store } from "@tanstack/react-store"
import type { ReactNode } from "react"

// Holds a stack of modal content, not keys — ModalHost just portals whatever
// is on top, so adding a new modal (nested or not) never touches ModalHost
// or the store.
export const modalStore = new Store<ReactNode[]>([])

// Layers a new modal on top of whatever's currently open.
export function openModal(content: ReactNode) {
	modalStore.setState((stack) => [...stack, content])
}

// Removes the top modal, revealing whatever was underneath (or nothing, once
// the stack empties). This is "back" for a nested modal and "dismiss" for a
// top-level one - same action, since dismissing a depth-1 stack empties it.
export function closeModal() {
	modalStore.setState((stack) => stack.slice(0, -1))
}

// Collapses the whole stack down to a single fresh modal - for a nested
// modal whose action (e.g. generating a new invite link) replaces what the
// modal beneath it was showing, rather than just returning to its stale state.
export function replaceModalStack(content: ReactNode) {
	modalStore.setState(() => [content])
}
