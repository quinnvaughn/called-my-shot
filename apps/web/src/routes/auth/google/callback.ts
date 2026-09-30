import { createFileRoute } from "@tanstack/react-router"
import { proxyGoogleAuth } from "#/lib/auth-proxy.server"

// The redirect URI registered with Google. The api finishes the sign-in, sets
// the session cookie, and redirects back to wherever the flow started.
export const Route = createFileRoute("/auth/google/callback")({
	server: {
		handlers: {
			GET: ({ request }) =>
				proxyGoogleAuth(request, "/auth/google/callback"),
		},
	},
})
