import { createFileRoute } from "@tanstack/react-router"
import { apiUrl } from "#/env.server"

// Same passthrough as /share/calls/$callId/card.png: the api has no public
// ingress, so this same-origin route is what an unfurl scraper actually hits
// for the og:image on /recaps/:token. The `?v=` cache-buster on that url is
// ignored here; it only exists to make a changed card a new url to Discord
// and iMessage.
export const Route = createFileRoute("/share/recaps/$token/card.png")({
	server: {
		handlers: {
			GET: async ({ params }) => {
				let upstream: Response
				try {
					upstream = await fetch(
						apiUrl(`/share/recaps/${encodeURIComponent(params.token)}.png`),
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
