import { createFileRoute } from "@tanstack/react-router"
import { apiUrl } from "#/env.server"

// The whole redraft at 4:5, fetched by the post page's Save image button to
// save or hand to the share sheet. Same passthrough as card.png. No .png
// on the end: only the button asks for it, and the Vite dev server answers
// any .png path itself as a missing static file before a route runs.
export const Route = createFileRoute("/share/redraft/$postId/portrait")({
	server: {
		handlers: {
			GET: async ({ params }) => {
				let upstream: Response
				try {
					upstream = await fetch(
						apiUrl(
							`/share/redraft/${encodeURIComponent(params.postId)}/portrait.png`,
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
