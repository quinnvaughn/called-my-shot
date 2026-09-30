import { createFileRoute } from "@tanstack/react-router"
import { proxyGoogleAuth } from "#/lib/auth-proxy.server"

// Where "Continue with Google" points. The api sets the flow cookie and
// redirects on to Google's account picker.
export const Route = createFileRoute("/auth/google/")({
	server: {
		handlers: {
			GET: ({ request }) => proxyGoogleAuth(request, "/auth/google"),
		},
	},
})
