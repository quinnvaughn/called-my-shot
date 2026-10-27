import { useEffect, useRef } from "react"

// Calls `onHidden` when the page is hidden (another tab, another app, the
// screen locked) while `active`, which is while a question is on the clock.
export function useWatchVisibility(active: boolean, onHidden: () => void) {
	const latest = useRef(onHidden)
	latest.current = onHidden

	useEffect(() => {
		if (!active) return
		const report = () => {
			if (document.visibilityState === "hidden") latest.current()
		}
		document.addEventListener("visibilitychange", report)
		window.addEventListener("pagehide", report)
		return () => {
			document.removeEventListener("visibilitychange", report)
			window.removeEventListener("pagehide", report)
		}
	}, [active])
}
