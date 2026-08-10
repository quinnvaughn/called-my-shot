import { ApolloClient, HttpLink, InMemoryCache } from "@apollo/client"

const GRAPHQL_URL = import.meta.env.VITE_GRAPHQL_URL ?? "http://localhost:4000/"

export function createApolloClient() {
	return new ApolloClient({
		link: new HttpLink({
			uri: GRAPHQL_URL,
			fetchOptions: { credentials: "include" },
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
