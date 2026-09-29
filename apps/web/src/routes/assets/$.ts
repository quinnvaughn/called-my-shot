import { createFileRoute } from "@tanstack/react-router"

// Only ever reached for a file that doesn't exist: Nitro serves everything
// actually in the build's /assets before a request gets to the app. Without
// this, a missing chunk fell through to the full SSR 404 page, and Cloudflare
// stamped that with its default four-hour browser cache - so a request that
// landed on a machine still running the previous build mid-deploy left the
// page unstyled for hours instead of until the next load.
export const Route = createFileRoute("/assets/$")({
	server: {
		handlers: {
			GET: () =>
				new Response("Not Found", {
					status: 404,
					headers: {
						"content-type": "text/plain",
						"cache-control": "no-store",
					},
				}),
		},
	},
})
