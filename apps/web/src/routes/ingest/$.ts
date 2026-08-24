import { createFileRoute } from "@tanstack/react-router"

// PostHog's own domains are on ad-blocker lists (EasyPrivacy), so posthog-js
// is pointed at this same-origin path instead (see #/lib/analytics.ts) -
// requests here are indistinguishable from any other first-party API call.
// Same passthrough reasoning as /graphql and /share/* - just forwarding to
// PostHog's ingest host instead of the api.
const POSTHOG_INGEST_HOST = "https://us.i.posthog.com"

async function proxy(request: Request) {
	const url = new URL(request.url)
	const upstreamPath = url.pathname.replace(/^\/ingest/, "") || "/"
	const upstreamUrl = `${POSTHOG_INGEST_HOST}${upstreamPath}${url.search}`

	const headers = new Headers()
	const contentType = request.headers.get("content-type")
	if (contentType) headers.set("content-type", contentType)
	// posthog-js gzips batched capture payloads - forwarding as text would
	// mangle that binary body, so the raw bytes (and their encoding header)
	// are passed straight through instead.
	const contentEncoding = request.headers.get("content-encoding")
	if (contentEncoding) headers.set("content-encoding", contentEncoding)

	let upstream: Response
	try {
		upstream = await fetch(upstreamUrl, {
			method: request.method,
			headers,
			body:
				request.method === "GET" || request.method === "HEAD"
					? undefined
					: await request.arrayBuffer(),
		})
	} catch {
		return new Response("Bad Gateway", { status: 502 })
	}

	const responseHeaders = new Headers()
	const upstreamContentType = upstream.headers.get("content-type")
	if (upstreamContentType) {
		responseHeaders.set("content-type", upstreamContentType)
	}

	return new Response(upstream.body, {
		status: upstream.status,
		headers: responseHeaders,
	})
}

export const Route = createFileRoute("/ingest/$")({
	server: {
		handlers: {
			GET: async ({ request }) => proxy(request),
			POST: async ({ request }) => proxy(request),
		},
	},
})
