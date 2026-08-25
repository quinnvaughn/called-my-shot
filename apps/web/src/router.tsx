import { createRouter as createTanStackRouter } from "@tanstack/react-router"
import { createIsomorphicFn } from "@tanstack/react-start"
import { getRequestHeader } from "@tanstack/react-start/server"
import type { ReactNode } from "react"
import { createApolloClient } from "./graphql/apollo-client"
import { routeTree } from "./routeTree.gen"

const getCookie = createIsomorphicFn()
	.server(() => getRequestHeader("cookie"))
	.client(() => undefined)

export function getRouter() {
	const cookie = getCookie()
	const apolloClient = createApolloClient(cookie)

	const router = createTanStackRouter({
		routeTree,
		scrollRestoration: true,
		defaultPreload: "intent",
		defaultPreloadStaleTime: 0,
		// Completes the caching model apollo-client.ts already documents:
		// client.query() always hits the network, so the router is the only
		// thing standing between a route and a full refetch. Without this,
		// that default was 0 - immediately stale - so every nav (even
		// Home -> Leaderboard -> Home) refetched everything from scratch.
		// Every mutation already calls router.invalidate() (see
		// components/settings, groups, questions, etc.) to force a fresh
		// read of the viewer's own writes, so this window only affects how
		// long another user's changes take to show up on a revisit.
		defaultStaleTime: 30_000,
		context: { apolloClient },
	})

	return router
}

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>
	}
	interface StaticDataRouteOption {
		rightRail?: ReactNode
	}
}
