import { QueryClient } from "@tanstack/react-query"
import { createRouter as createTanStackRouter } from "@tanstack/react-router"
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query"
import { createIsomorphicFn } from "@tanstack/react-start"
import { getRequestHeader } from "@tanstack/react-start/server"
import type { ReactNode } from "react"
import { routeTree } from "./routeTree.gen"

const getCookie = createIsomorphicFn()
	.server(() => getRequestHeader("cookie"))
	.client(() => undefined)

export function getRouter() {
	const cookie = getCookie()
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				// Same window the router applies to loaders below, so a warm
				// loader and a warm component read agree on what counts as
				// stale instead of one refetching behind the other.
				staleTime: 30_000,
				// SSR forwards the browser's session; the queryFn is called by
				// the client rather than by us, so this is the only seam it can
				// travel through (see graphql/query-options.ts).
				meta: { cookie },
			},
		},
	})

	const router = createTanStackRouter({
		routeTree,
		scrollRestoration: true,
		defaultPreload: "intent",
		defaultPreloadStaleTime: 0,
		// Matches the query client's staleTime above, so the two gates a
		// navigation passes through agree: the router decides whether to re-run
		// a loader, and the loader's queryClient.query decides whether that
		// costs a request. The default is 0 - immediately stale - which would re-run
		// every loader on every nav (even Home -> Leaderboard -> Home). Writes
		// don't wait for this window: mutations invalidate the queries they
		// touch, so it only affects how long another user's changes take to
		// show up on a revisit.
		defaultStaleTime: 30_000,
		context: { queryClient },
	})

	// Dehydrates the query cache into the SSR payload and rehydrates it on the
	// client, so a loader's prefetch survives into the browser instead of every
	// suspense read refetching the moment it mounts. Also mounts
	// QueryClientProvider via router.options.Wrap - there's no provider in
	// __root.tsx because this puts one there.
	setupRouterSsrQueryIntegration({ router, queryClient })

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
