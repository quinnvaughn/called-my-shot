import {
	type CallGif,
	GIF_POOLS,
	JOIN_GIFS,
	OH_FER_GIFS,
	PERFECT_GIFS,
} from "@called-my-shot/gifs"

type Pools = Record<string, readonly CallGif[]>

// Every pool the app draws from. The call pools by result state, the group
// invite page's under "join", and a finished game's entry page under
// "perfect" and "oh_fer".
const ALL_POOLS: Pools = {
	...GIF_POOLS,
	join: JOIN_GIFS,
	perfect: PERFECT_GIFS,
	oh_fer: OH_FER_GIFS,
}

// One url in one pool, and whether it is still there.
export type GifHealthRow = {
	// A CallGifState, or "join", "perfect" or "oh_fer" for the pools outside
	// the call page.
	state: string
	url: string
	alt: string
	// The HTTP status the host answered with, or null when nothing answered
	// at all - a timeout, a DNS failure, a refused connection. The two are
	// kept apart because they mean different things: a 404 is a gif that is
	// gone, a null is a check that didn't happen.
	status: number | null
	ok: boolean
	error: string | null
}

// Without a timeout one unresponsive host holds the whole report open, and
// the admin staring at it has no way to tell that from a slow check.
const REQUEST_TIMEOUT_MS = 8_000

// Deliberately not the serialized requester the ESPN sync uses. That one
// paces a scheduled crawl against a single origin that rate-limits us and
// will refuse the run if we push; this is an admin pressing a button against
// a public CDN, and sixty urls at one every 250ms is fifteen seconds of
// staring at a blank table for no benefit anyone gets.
const CONCURRENCY = 6

// HEAD is the right request - we want the status, not a megabyte of gif - but
// CDNs do sometimes refuse it while serving the asset perfectly well over
// GET. Reporting that as a dead link would send someone hunting for a
// replacement that doesn't need replacing, so those two statuses get a second
// look with a ranged GET that asks for a single byte.
const HEAD_UNSUPPORTED = [403, 405]

async function checkUrl(
	url: string,
): Promise<Pick<GifHealthRow, "status" | "ok" | "error">> {
	try {
		let res = await fetch(url, {
			method: "HEAD",
			redirect: "follow",
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		})
		if (HEAD_UNSUPPORTED.includes(res.status)) {
			res = await fetch(url, {
				method: "GET",
				redirect: "follow",
				headers: { Range: "bytes=0-0" },
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			})
			// A host honouring the range answers 206, which res.ok does not
			// count as a success on its own terms but is exactly what we asked
			// for.
			if (res.status === 206) {
				return { status: 206, ok: true, error: null }
			}
		}
		return { status: res.status, ok: res.ok, error: null }
	} catch (err) {
		// Never throws. One bad url must not take down the report, which is
		// the only place the other fifty-nine get looked at.
		return {
			status: null,
			ok: false,
			error: err instanceof Error ? err.message : String(err),
		}
	}
}

// Checks every url in every pool and reports what it found, broken first.
//
// Live rather than read from a table a cron fills. A cached verdict is wrong
// in the direction that costs the most - a row still calling a url dead after
// the host put it back sends someone replacing a gif that works - and the
// whole check is a few seconds on a page an admin opens when they are already
// thinking about gifs.
//
// `pools` is a seam for the tests, which need a known set to check rather than
// whatever has been pasted into the real pools today.
export async function loadGifHealth(
	pools: Pools = ALL_POOLS,
): Promise<GifHealthRow[]> {
	const targets = Object.keys(pools).flatMap((state) =>
		pools[state].map((gif) => ({ state, url: gif.url, alt: gif.alt })),
	)

	const rows: GifHealthRow[] = []
	let next = 0
	async function worker() {
		while (next < targets.length) {
			const target = targets[next++]
			if (!target) return
			rows.push({ ...target, ...(await checkUrl(target.url)) })
		}
	}
	await Promise.all(
		Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker),
	)

	// Broken first, then grouped by state, so the reason the page was opened
	// is the first thing on it.
	return rows.sort((a, b) => {
		if (a.ok !== b.ok) return a.ok ? 1 : -1
		return a.state.localeCompare(b.state) || a.url.localeCompare(b.url)
	})
}

// Which states have no gif at all. An empty pool is as broken as a 404 - that
// state's calls silently render nothing - and it cannot show up in the rows
// above, because there is no url to check.
export function emptyGifPools(pools: Pools = ALL_POOLS): string[] {
	return Object.keys(pools).filter(
		(state) => pools[state].length === 0,
	)
}
