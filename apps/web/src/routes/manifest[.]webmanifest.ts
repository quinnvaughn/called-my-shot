import { createFileRoute } from "@tanstack/react-router"

// What a browser reads to add the app to a home screen. A route rather than
// a file in public/ for the same reason as the worker: so a change reaches people
// without waiting out a CDN cache.
const MANIFEST = {
	id: "/",
	name: "Called My Shot",
	short_name: "Called My Shot",
	description:
		"Daily sports puzzles and calls on real games, scored on private leaderboards with your group chat, your fantasy league, or your audience.",
	start_url: "/",
	scope: "/",
	display: "standalone",
	background_color: "#0B0B0C",
	theme_color: "#0B0B0C",
	icons: [
		{
			src: "/android-chrome-192x192.png",
			sizes: "192x192",
			type: "image/png",
			purpose: "any",
		},
		{
			src: "/android-chrome-512x512.png",
			sizes: "512x512",
			type: "image/png",
			purpose: "any",
		},
		{
			src: "/maskable-512x512.png",
			sizes: "512x512",
			type: "image/png",
			purpose: "maskable",
		},
	],
}

export const Route = createFileRoute("/manifest.webmanifest")({
	server: {
		handlers: {
			GET: () =>
				new Response(JSON.stringify(MANIFEST), {
					headers: {
						"content-type": "application/manifest+json",
						"cache-control": "no-cache",
					},
				}),
		},
	},
})
