import { type UIEvent, useEffect, useRef } from "react"

// How long after the last scroll event the element still counts as
// scrolling.
const SETTLE_MS = 800

// Marks the scrolled element with data-scrolling while it's moving, for
// styles that only show mid-scroll. Written to the element directly rather
// than through state, so scrolling doesn't re-render whatever's inside it.
export function useScrollingFlag() {
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

	useEffect(
		() => () => {
			if (timer.current) clearTimeout(timer.current)
		},
		[],
	)

	return function onScroll(event: UIEvent<HTMLElement>) {
		const element = event.currentTarget
		element.dataset.scrolling = ""
		if (timer.current) clearTimeout(timer.current)
		timer.current = setTimeout(() => {
			delete element.dataset.scrolling
		}, SETTLE_MS)
	}
}
