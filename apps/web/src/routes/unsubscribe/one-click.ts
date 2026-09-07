import { createFileRoute } from "@tanstack/react-router"
import { env } from "#/env.server"

// What the List-Unsubscribe / List-Unsubscribe-Post headers point at. Gmail
// and Yahoo POST here with no session, no cookie and no user interaction, and
// expect a 2xx - so this can't be behind auth and can't render anything. The
// signed token in the query string is the whole credential (see
// lib/email-unsubscribe.ts on the api).
//
// Lives in the web app rather than the api because the api has no public
// ingress - same reason routes/share/* are proxies.
const MUTATION = `
	mutation UnsubscribeOneClick($token: String!) {
		unsubscribeFromEmails(token: $token) {
			__typename
		}
	}
`

export const Route = createFileRoute("/unsubscribe/one-click")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const token = new URL(request.url).searchParams.get("token")
				if (!token) return new Response("Missing token", { status: 400 })

				try {
					await fetch(env.API_INTERNAL_URL, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							query: MUTATION,
							variables: { token },
						}),
					})
				} catch {
					return new Response("Bad Gateway", { status: 502 })
				}

				// 200 regardless of whether the token turned out to be valid. A
				// provider retries or flags a non-2xx, and there is nothing
				// useful for it to do with "that token was already used" - the
				// human-facing page at /unsubscribe is where a real error gets
				// explained to a real person.
				return new Response(null, { status: 204 })
			},
		},
	},
})
