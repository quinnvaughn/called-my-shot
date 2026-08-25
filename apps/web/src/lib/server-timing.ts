import { createIsomorphicFn } from "@tanstack/react-start"
import {
	getResponseHeader,
	setResponseHeader,
} from "@tanstack/react-start/server"

// setResponseHeader/getResponseHeader throw outside a server request
// context (no AsyncLocalStorage h3 event to read) - beforeLoad/loader
// functions also run client-side on navigation, not just during SSR, so
// this can't call them unconditionally. Same isomorphic-split pattern
// already used for getCookie (router.tsx) and getGraphQLUrl
// (apollo-client.ts): a no-op on the client, the real header write on the
// server.
const recordServerTiming = createIsomorphicFn()
	.server((name: string, description: string, durationMs: number) => {
		const existing = getResponseHeader("Server-Timing")
		const entry = `${name};dur=${durationMs.toFixed(1)};desc="${description}"`
		setResponseHeader(
			"Server-Timing",
			existing ? `${existing}, ${entry}` : entry,
		)
	})
	.client((_name: string, _description: string, _durationMs: number) => {})

// Wrap an SSR-side async operation (a beforeLoad/loader's GraphQL round
// trip, say) to record its wall-clock duration on the outgoing response's
// Server-Timing header - it shows up natively in DevTools' Network > Timing
// tab under "Server Timing", broken out by name, instead of us inferring
// which phase is slow from screenshots of the total. Appends rather than
// overwrites: root's beforeLoad and a route's own loader both call this on
// the same response, and whichever runs second must not clobber what the
// first already wrote.
export async function timed<T>(
	name: string,
	description: string,
	fn: () => Promise<T>,
): Promise<T> {
	const start = performance.now()
	try {
		return await fn()
	} finally {
		recordServerTiming(name, description, performance.now() - start)
	}
}
