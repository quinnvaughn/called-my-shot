import { type RefObject, useEffect } from "react"
import { closeModal } from "#/stores/modal-store"

const FOCUSABLE_SELECTOR =
	"input, button, [href], select, textarea, [tabindex]:not([tabindex='-1'])"

// Shared open/close behavior for anything ModalHost renders (Modal, Sheet).
// Mounting is opening: lock page scroll, move focus inside, close on Escape.
// Unmounting is closing: unlock scroll and hand focus back to whatever had it.
export function useDialogBehavior(containerRef: RefObject<HTMLElement | null>) {
	useEffect(() => {
		const lastFocused = document.activeElement as HTMLElement | null
		document.body.style.overflow = "hidden"

		const focusTarget =
			containerRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ??
			containerRef.current
		focusTarget?.focus()

		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") closeModal()
		}
		document.addEventListener("keydown", onKeyDown)

		return () => {
			document.body.style.overflow = ""
			document.removeEventListener("keydown", onKeyDown)
			lastFocused?.focus()
		}
	}, [containerRef])
}
