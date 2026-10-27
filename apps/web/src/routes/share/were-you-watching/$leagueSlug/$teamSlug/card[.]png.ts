import { createFileRoute } from "@tanstack/react-router"
import { apiUrl } from "#/env.server"

// Same passthrough as /share/calls/$callId/card.png, for the og:image on
// /arcade/were-you-watching/:league/:team: the team's current quiz. The page
// adds a `?v=` of the quiz's code, ignored here, so a newer game re-scrapes.
export const Route = createFileRoute(
	"/share/were-you-watching/$leagueSlug/$teamSlug/card.png",
)({
	server: {
		handlers: {
			GET: async ({ params }) => {
				let upstream: Response
				try {
					upstream = await fetch(
						apiUrl(
							`/share/were-you-watching/${encodeURIComponent(params.leagueSlug)}/${encodeURIComponent(params.teamSlug)}.png`,
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
