import { createFileRoute } from "@tanstack/react-router"
import { apiUrl } from "#/env.server"

// Same passthrough as /share/calls/$callId/card.png, for the og:image on
// /rushmore/$code: the crowd's Rushmore for a prompt.
export const Route = createFileRoute("/share/rushmore-prompts/$code/card.png")({
	server: {
		handlers: {
			GET: async ({ params }) => {
				let upstream: Response
				try {
					upstream = await fetch(
						apiUrl(
							`/share/rushmore-prompts/${encodeURIComponent(params.code)}.png`,
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
