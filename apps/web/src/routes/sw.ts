import { createFileRoute } from "@tanstack/react-router"
import serviceWorker from "#/sw/service-worker.js?raw"

// The service worker, from a route rather than public/ so its headers are
// ours to set: a static file would pick up Cloudflare's default browser cache,
// and an updated worker would then take hours to reach anyone. Served from
// the root so its scope covers the whole app. No .js extension: the Vite dev
// server claims every .js path as a module and 404s it before any route runs,
// and a browser only checks a worker's content-type, not its name.
export const Route = createFileRoute("/sw")({
	server: {
		handlers: {
			GET: () =>
				new Response(serviceWorker, {
					headers: {
						"content-type": "application/javascript; charset=utf-8",
						"cache-control": "no-cache",
					},
				}),
		},
	},
})
