import { ApolloClient, HttpLink, InMemoryCache } from "@apollo/client"
import { createIsomorphicFn } from "@tanstack/react-start"
import { env } from "../env.server"

// The browser always talks to this app's own origin (same-origin /graphql,
// proxied server-side to the api) so the session cookie is never cross-site.
// SSR calls the api directly since that request never touches the browser.
const getGraphQLUrl = createIsomorphicFn()
	.server(() => env.API_INTERNAL_URL)
	.client(() => "/graphql")

export function createApolloClient(cookie?: string) {
	return new ApolloClient({
		link: new HttpLink({
			uri: getGraphQLUrl(),
			fetchOptions: { credentials: "include" },
			headers: cookie ? { cookie } : undefined,
		}),
		cache: new InMemoryCache(),
		// Router owns staleness (loader staleTime/gcTime + router.invalidate()).
		// Always hit the network on client.query() so invalidate() actually refetches
		// instead of Apollo's cache-first policy silently returning stale data.
		defaultOptions: {
			query: { fetchPolicy: "network-only" },
		},
	})
}

export type AppApolloClient = ReturnType<typeof createApolloClient>
