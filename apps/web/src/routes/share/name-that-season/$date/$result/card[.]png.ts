import { createFileRoute } from "@tanstack/react-router"
import { apiUrl } from "#/env.server"

// Same passthrough as /share/calls/$callId/card.png, for the og:image on
// /play/name-that-season/:date/:result - including the static card.png segment
// and the ignored `?v=` cache-buster, for the same reasons given there.
export const Route = createFileRoute(
	"/share/name-that-season/$date/$result/card.png",
)({
	server: {
		handlers: {
			GET: async ({ params, request }) => {
				// `by` names whose result it is; the API keeps it only if it's
				// really theirs.
				const by = new URL(request.url).searchParams.get("by")
				const query = by ? `?by=${encodeURIComponent(by)}` : ""
				let upstream: Response
				try {
					upstream = await fetch(
						apiUrl(
							`/share/name-that-season/${encodeURIComponent(params.date)}/${encodeURIComponent(params.result)}.png${query}`,
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
