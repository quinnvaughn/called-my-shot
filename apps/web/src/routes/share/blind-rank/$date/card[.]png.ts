import { createFileRoute } from "@tanstack/react-router"
import { apiUrl } from "#/env.server"

// Same passthrough as /share/calls/$callId/card.png, for the og:image on
// /arcade/blind-rank: today's puzzle, by date, so a link pasted on an earlier
// day keeps that day's preview.
export const Route = createFileRoute("/share/blind-rank/$date/card.png")({
	server: {
		handlers: {
			GET: async ({ params }) => {
				let upstream: Response
				try {
					upstream = await fetch(
						apiUrl(`/share/blind-rank/${encodeURIComponent(params.date)}.png`),
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
