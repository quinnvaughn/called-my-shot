import { useCallback, useSyncExternalStore } from "react"

// Whether a CSS media query currently matches. False while server-rendering
// and through hydration, since matchMedia doesn't exist on the server, so
// nothing that depends on this should decide layout the server has to match.
export function useMediaQuery(query: string): boolean {
	const subscribe = useCallback(
		(onChange: () => void) => {
			const list = window.matchMedia(query)
			list.addEventListener("change", onChange)
			return () => list.removeEventListener("change", onChange)
		},
		[query],
	)
	return useSyncExternalStore(
		subscribe,
		() => window.matchMedia(query).matches,
		() => false,
	)
}
