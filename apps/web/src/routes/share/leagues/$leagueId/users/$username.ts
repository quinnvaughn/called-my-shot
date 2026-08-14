import { createFileRoute } from "@tanstack/react-router"
import { apiUrl } from "#/env.server"

// League-scoped sibling of /share/users/$username - see that route for why
// this proxies rather than pointing the browser at the api directly.
export const Route = createFileRoute(
	"/share/leagues/$leagueId/users/$username",
)({
	server: {
		handlers: {
			GET: async ({ params }) => {
				let upstream: Response
				try {
					upstream = await fetch(
						apiUrl(
							`/share/users/${params.username}/leagues/${params.leagueId}.png`,
						),
					)
				} catch {
					return new Response("Bad Gateway", { status: 502 })
				}

				const headers = new Headers()
				const contentType = upstream.headers.get("content-type")
				if (contentType) headers.set("content-type", contentType)
				const cacheControl = upstream.headers.get("cache-control")
				if (cacheControl) headers.set("cache-control", cacheControl)

				return new Response(upstream.body, {
					status: upstream.status,
					headers,
				})
			},
		},
	},
})
