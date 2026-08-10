import { createFileRoute } from "@tanstack/react-router"
import { env } from "../env.server"

// Reaches the api over Fly's private network in production, so the browser
// never talks to the api's own domain directly - keeping the session cookie
// first-party to this app's origin regardless of third-party cookie policy.
const API_URL = env.API_INTERNAL_URL

export const Route = createFileRoute("/graphql")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const cookie = request.headers.get("cookie")
				const contentType =
					request.headers.get("content-type") ?? "application/json"

				let upstream: Response
				try {
					upstream = await fetch(API_URL, {
						method: "POST",
						headers: {
							"content-type": contentType,
							...(cookie ? { cookie } : {}),
						},
						body: await request.text(),
					})
				} catch {
					return new Response("Bad Gateway", { status: 502 })
				}

				const headers = new Headers()
				const upstreamContentType = upstream.headers.get("content-type")
				if (upstreamContentType)
					headers.set("content-type", upstreamContentType)
				for (const setCookie of upstream.headers.getSetCookie()) {
					headers.append("set-cookie", setCookie)
				}

				return new Response(upstream.body, {
					status: upstream.status,
					headers,
				})
			},
		},
	},
})
