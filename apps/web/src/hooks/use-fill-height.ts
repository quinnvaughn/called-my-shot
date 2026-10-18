import { type RefObject, useLayoutEffect, useState } from "react"

// The height that takes an element from where it starts down to the bottom
// of the viewport, less `gap`: for a panel that fills the rest of the screen
// and scrolls inside itself, like a chat. Re-measured when the window
// resizes.
export function useFillHeight(
	ref: RefObject<HTMLElement | null>,
	gap = 24,
): number | null {
	const [height, setHeight] = useState<number | null>(null)
	useLayoutEffect(() => {
		function measure() {
			const el = ref.current
			if (!el) return
			const top = el.getBoundingClientRect().top + window.scrollY
			setHeight(Math.max(240, window.innerHeight - top - gap))
		}
		measure()
		window.addEventListener("resize", measure)
		return () => window.removeEventListener("resize", measure)
	}, [ref, gap])
	return height
}
