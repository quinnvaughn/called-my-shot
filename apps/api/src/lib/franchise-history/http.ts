import { setTimeout as sleep } from "node:timers/promises"

// Requests to the public reference sites the franchise histories and the
// portrait pipeline read. A generic agent string that names the app and
// nothing about who runs it, since some of these sites ask for one.
export const USER_AGENT = "CalledMyShot/1.0 (+https://calledmyshot.com)"

// The gap kept between two requests to one host, for the hosts that publish
// or enforce a limit. Basketball- and Baseball-Reference block a client for
// an hour past about 20 requests a minute; Wikidata and Wikipedia ask bots to
// go one at a time. Anything unlisted gets DEFAULT_SPACING_MS.
const HOST_SPACING_MS: Record<string, number> = {
	"www.basketball-reference.com": 3_500,
	"www.baseball-reference.com": 3_500,
	"query.wikidata.org": 1_000,
	"en.wikipedia.org": 250,
	"upload.wikimedia.org": 200,
	"thumb.wikimedia.org": 200,
	"statsapi.mlb.com": 25,
	"records.nhl.com": 250,
}
const DEFAULT_SPACING_MS = 50

// NBA.com's edge resets the connection for any agent string it doesn't
// recognise as a browser, so its CDN is asked with fetch's own.
const NO_AGENT_HOSTS = new Set(["cdn.nba.com"])

// The next moment each host may be asked something. Claimed before a request
// starts, so concurrent callers queue up behind one another instead of all
// firing at once.
const nextSlot = new Map<string, number>()

async function waitForHost(host: string): Promise<void> {
	const spacing = HOST_SPACING_MS[host] ?? DEFAULT_SPACING_MS
	const now = Date.now()
	const at = Math.max(now, nextSlot.get(host) ?? 0)
	nextSlot.set(host, at + spacing)
	if (at > now) await sleep(at - now)
}

const RETRIES = 4

// fetch, spaced per host and retried on a 429, a 5xx or a dropped connection
// with a growing backoff (or the server's own Retry-After). Any other status
// comes back as is for the caller to read: a 404 is an answer here, not an
// error.
export async function politeFetch(
	url: string,
	init: RequestInit = {},
): Promise<Response> {
	const host = new URL(url).host
	for (let attempt = 0; ; attempt++) {
		await waitForHost(host)
		try {
			const res = await fetch(url, {
				...init,
				headers: NO_AGENT_HOSTS.has(host)
					? init.headers
					: { "User-Agent": USER_AGENT, ...init.headers },
				signal: init.signal ?? AbortSignal.timeout(60_000),
			})
			if ((res.status === 429 || res.status >= 500) && attempt < RETRIES) {
				await res.body?.cancel()
				const retryAfter = Number(res.headers.get("retry-after"))
				await sleep(
					Number.isFinite(retryAfter) && retryAfter > 0
						? Math.min(retryAfter, 120) * 1000
						: 2 ** attempt * 2_000,
				)
				continue
			}
			return res
		} catch (error) {
			if (attempt >= RETRIES) throw error
			await sleep(2 ** attempt * 2_000)
		}
	}
}

async function ok(url: string, init?: RequestInit): Promise<Response> {
	const res = await politeFetch(url, init)
	if (!res.ok) {
		await res.body?.cancel()
		throw new Error(`GET ${url} failed (${res.status})`)
	}
	return res
}

export async function fetchText(url: string, init?: RequestInit) {
	return (await ok(url, init)).text()
}

export async function fetchJson<T>(url: string, init?: RequestInit) {
	return (await ok(url, init)).json() as Promise<T>
}

// Runs fn over items with at most `concurrency` in flight, keeping order.
export async function mapPool<T, R>(
	items: readonly T[],
	concurrency: number,
	fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	const results = new Array<R>(items.length)
	let next = 0
	const worker = async () => {
		while (next < items.length) {
			const index = next++
			results[index] = await fn(items[index] as T, index)
		}
	}
	await Promise.all(
		Array.from({ length: Math.min(concurrency, items.length) }, worker),
	)
	return results
}
