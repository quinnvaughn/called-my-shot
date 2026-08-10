import { createRouter as createTanStackRouter } from "@tanstack/react-router"
import { createIsomorphicFn } from "@tanstack/react-start"
import { getRequestHeader } from "@tanstack/react-start/server"
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
		context: { apolloClient },
	})

	return router
}

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>
	}
}
