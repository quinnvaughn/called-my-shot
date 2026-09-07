import { createFileRoute } from "@tanstack/react-router"
import { apiUrl } from "#/env.server"

// Resend posts delivery events here. A proxy rather than the real handler
// because the api has no public ingress (same reason routes/share/* exist),
// and the verification has to happen against the api's signing secret.
//
// The body is forwarded as raw text and the svix-* headers are passed through
// untouched: the signature covers the exact bytes Resend sent, so anything
// that parses and re-serializes on the way through breaks it.
export const Route = createFileRoute("/webhooks/resend")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const headers = new Headers({ "content-type": "application/json" })
				for (const header of ["svix-id", "svix-timestamp", "svix-signature"]) {
					const value = request.headers.get(header)
					if (value) headers.set(header, value)
				}

				let upstream: Response
				try {
					upstream = await fetch(apiUrl("/webhooks/resend"), {
						method: "POST",
						headers,
						body: await request.text(),
					})
				} catch {
					// Non-2xx makes Svix retry, which is what we want if the api
					// is momentarily unreachable.
					return new Response("Bad Gateway", { status: 502 })
				}

				return new Response(null, { status: upstream.status })
			},
		},
	},
})
