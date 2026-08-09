import { createRouter as createTanStackRouter } from "@tanstack/react-router"
import { createApolloClient } from "./graphql/apollo-client"
import { routeTree } from "./routeTree.gen"

export function getRouter() {
	const apolloClient = createApolloClient()

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
