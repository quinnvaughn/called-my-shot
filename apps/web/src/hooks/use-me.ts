import { useRouteContext } from "@tanstack/react-router"

/** The signed-in viewer, or null when signed out. */
export function useMe() {
	return useRouteContext({ from: "__root__", select: (context) => context.me })
}

/** The zone the request's cookie named, which SSR rendered in. */
export function useTimeZone() {
	return useRouteContext({
		from: "__root__",
		select: (context) => context.timeZone,
	})
}

/** The moment the server rendered the page. */
export function useRenderedAt() {
	return useRouteContext({ from: "__root__", select: (context) => context.now })
}
