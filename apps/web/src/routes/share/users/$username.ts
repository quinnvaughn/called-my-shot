import { createFileRoute } from "@tanstack/react-router"
import { apiUrl } from "#/env.server"

// Same reasoning as /graphql (see routes/graphql.ts): the api has no public
// ingress in production, only reachable from this app's own server over
// Fly's private network - so the browser (an <img src>, or a fetch() for
// the copy-to-clipboard flow) always hits this same-origin route instead.
export const Route = createFileRoute("/share/users/$username")({
	server: {
		handlers: {
			GET: async ({ params }) => {
				let upstream: Response
				try {
					upstream = await fetch(apiUrl(`/share/users/${params.username}.png`))
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
