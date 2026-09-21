import { createFileRoute } from "@tanstack/react-router"

// The build this server is running. A client whose own VITE_BUILD_ID differs
// was loaded before the latest deploy (see hooks/use-stale-build-guard.ts).
export const Route = createFileRoute("/version")({
	server: {
		handlers: {
			GET: () =>
				new Response(
					(import.meta.env.VITE_BUILD_ID as string | undefined) ?? "",
					{
						headers: {
							"content-type": "text/plain",
							"cache-control": "no-store",
						},
					},
				),
		},
	},
})
