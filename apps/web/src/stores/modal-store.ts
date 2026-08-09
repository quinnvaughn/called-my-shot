import { Store } from "@tanstack/react-store"
import type { ReactNode } from "react"

// Holds the actual content to render, not a key — ModalHost just portals
// whatever's here, so adding a new modal never touches ModalHost or the store.
export const modalStore = new Store<ReactNode>(null)

export function openModal(content: ReactNode) {
	modalStore.setState(() => content)
}

export function closeModal() {
	modalStore.setState(() => null)
}
