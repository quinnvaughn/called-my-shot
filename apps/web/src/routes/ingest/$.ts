import { createFileRoute } from "@tanstack/react-router"

// PostHog's own domains are on ad-blocker lists (EasyPrivacy), so posthog-js
// is pointed at this same-origin path instead (see #/lib/analytics.ts) -
// requests here are indistinguishable from any other first-party API call.
// Same passthrough reasoning as /graphql and /share/* - just forwarding to
// PostHog's ingest host instead of the api.
const POSTHOG_INGEST_HOST = "https://us.i.posthog.com"

// Fly terminates TLS at its edge, so the visitor's address survives only in
// these headers - `fly-client-ip` holds it on its own, x-forwarded-for as a
// chain whose first entry is the client.
function getClientIp(request: Request) {
	const flyClientIp = request.headers.get("fly-client-ip")
	if (flyClientIp) return flyClientIp
	const forwardedFor = request.headers.get("x-forwarded-for")
	return forwardedFor?.split(",")[0]?.trim() || null
}

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

	// PostHog derives geolocation from the address the request arrives on,
	// which for the fetch below is the machine serving the app rather than the
	// visitor - without these every event geolocates to the deploy region. The
	// ingest endpoint reads the first x-forwarded-for entry, falling back to
	// x-real-ip.
	const clientIp = getClientIp(request)
	if (clientIp) {
		headers.set("x-forwarded-for", clientIp)
		headers.set("x-real-ip", clientIp)
	}
	// Same reasoning for the user agent: the default is the server runtime's,
	// which PostHog would otherwise attribute to the visitor's device.
	const userAgent = request.headers.get("user-agent")
	if (userAgent) headers.set("user-agent", userAgent)

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
