import { type RefObject, useEffect, useRef } from "react"
import { closeModal } from "#/stores/modal-store"

const FOCUSABLE_SELECTOR =
	"input, button, [href], select, textarea, [tabindex]:not([tabindex='-1'])"

// Shared open/close behavior for anything ModalHost renders (Modal, Sheet).
// Mounting is opening: lock page scroll, move focus inside, close on Escape.
// Unmounting is closing: unlock scroll and hand focus back to whatever had it.
// `dismiss` is what Escape does, closeModal unless the dialog needs to know
// it was dismissed.
export function useDialogBehavior(
	containerRef: RefObject<HTMLElement | null>,
	dismiss: () => void = closeModal,
) {
	// Read through a ref so a new callback each render doesn't re-run the
	// effect, which would steal focus back to the first field.
	const dismissRef = useRef(dismiss)
	dismissRef.current = dismiss

	useEffect(() => {
		const lastFocused = document.activeElement as HTMLElement | null
		document.body.style.overflow = "hidden"

		// A field that took focus on mount (autoFocus) keeps it; moving it to
		// the first focusable would blur the field, which validates it.
		const container = containerRef.current
		if (!container?.contains(document.activeElement)) {
			const focusTarget =
				container?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ?? container
			focusTarget?.focus()
		}

		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") dismissRef.current()
		}
		document.addEventListener("keydown", onKeyDown)

		return () => {
			document.body.style.overflow = ""
			document.removeEventListener("keydown", onKeyDown)
			lastFocused?.focus()
		}
	}, [containerRef])
}
