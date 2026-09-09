import { createFileRoute } from "@tanstack/react-router"
import { apiUrl } from "#/env.server"

// Same passthrough reasoning as /share/users/$username - the api has no
// public ingress, so this same-origin route is what the outside world
// actually hits.
//
// The only consumer is the og:image on /calls/:id, i.e. someone else's
// crawler. Hence the real .png extension: the content-type below is correct
// either way, but an extensionless image url is the kind of thing an unfurl
// scraper quietly declines to render, and there is no way to find out from
// here that it did. It sits on its own static segment rather than as
// ".../$callId.png" because the router reads the latter as a param literally
// named "callId.png"; the bracket escape sitemap[.]xml.ts uses only works on
// a static segment.
//
// A `?v=` cache-buster rides along on that url and is deliberately ignored -
// it exists to make a resolved call a different url to X and Slack than the
// pending one they already scraped.
export const Route = createFileRoute("/share/calls/$callId/card.png")({
	server: {
		handlers: {
			GET: async ({ params }) => {
				let upstream: Response
				try {
					upstream = await fetch(apiUrl(`/share/calls/${params.callId}.png`))
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
