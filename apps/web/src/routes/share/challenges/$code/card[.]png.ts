import { createFileRoute } from "@tanstack/react-router"
import { apiUrl } from "#/env.server"

// Same passthrough as /share/calls/$callId/card.png, for the og:image on
// /challenges/:code - including the static card.png segment and the ignored
// `?v=` cache-buster, for the same reasons given there.
export const Route = createFileRoute("/share/challenges/$code/card.png")({
	server: {
		handlers: {
			GET: async ({ params }) => {
				let upstream: Response
				try {
					upstream = await fetch(
						apiUrl(`/share/challenges/${encodeURIComponent(params.code)}.png`),
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
