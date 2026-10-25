import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import {
	allCandidates,
	cdnCandidates,
	findPhoto,
	NBA_PLACEHOLDER_BYTES,
	NFL_PLACEHOLDER_ETAG,
	type PortraitSubject,
} from "./sources"
import { cutoutPng, opaquePng } from "./test-images"

let cutout: Buffer
let opaque: Buffer
beforeAll(async () => {
	cutout = await cutoutPng()
	opaque = await opaquePng()
})

type Route = {
	status?: number
	body?: Buffer
	headers?: Record<string, string>
}

// Answers each URL from a table, by substring; anything unlisted 404s.
function serve(routes: Record<string, Route>) {
	const calls: string[] = []
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string, init?: RequestInit) => {
			calls.push(`${init?.method ?? "GET"} ${url}`)
			const match = Object.entries(routes).find(([part]) => url.includes(part))
			const route = match?.[1] ?? { status: 404 }
			return new Response(
				init?.method === "HEAD" || !route.body
					? null
					: new Uint8Array(route.body),
				{
					status: route.status ?? 200,
					headers: route.headers,
				},
			)
		}),
	)
	return calls
}

afterEach(() => {
	vi.unstubAllGlobals()
})

const subject = (overrides: Partial<PortraitSubject>): PortraitSubject => ({
	playerId: "p1",
	name: "Some Player",
	league: "nba",
	headshotUrl: null,
	historyId: null,
	espnId: null,
	...overrides,
})

describe("findPhoto", () => {
	it("passes over NBA.com's silhouette for the next source", async () => {
		serve({
			"cdn.nba.com": { body: Buffer.alloc(NBA_PLACEHOLDER_BYTES, 1) },
			"basketball-reference.com": { body: opaque },
		})
		const photo = await findPhoto(
			allCandidates(
				subject({
					headshotUrl:
						"https://cdn.nba.com/headshots/nba/latest/1040x760/76.png",
					historyId: "hewitbi01",
				}),
			),
		)
		expect(photo).toMatchObject({ source: "bref", cutout: false })
	})

	it("takes NBA.com's cutout when it's real", async () => {
		serve({ "cdn.nba.com": { body: cutout } })
		const photo = await findPhoto(
			cdnCandidates(
				subject({
					headshotUrl:
						"https://cdn.nba.com/headshots/nba/latest/1040x760/1449.png",
				}),
			),
		)
		expect(photo).toMatchObject({ source: "nba.com", cutout: true })
	})

	it("reads NFL.com's helmet placeholder off its ETag and falls back to ESPN", async () => {
		const calls = serve({
			"f_png,w_48": { headers: { etag: NFL_PLACEHOLDER_ETAG } },
			"a.espncdn.com": { body: cutout },
		})
		const photo = await findPhoto(
			cdnCandidates(
				subject({
					league: "nfl",
					headshotUrl:
						"https://static.www.nfl.com/image/private/f_auto,q_auto/league/abc123",
					espnId: "2330",
				}),
			),
		)
		expect(photo?.source).toBe("espn")
		expect(calls.some((call) => call.includes("f_png,w_600"))).toBe(false)
	})

	it("treats an NHL mug that redirects as missing, without following it", async () => {
		serve({ "assets.nhle.com": { status: 302, headers: { location: "/x" } } })
		const photo = await findPhoto(
			cdnCandidates(subject({ league: "nhl", historyId: "8444873" })),
		)
		expect(photo).toBeNull()
	})

	it("takes an opaque NHL mug as it is", async () => {
		serve({ "assets.nhle.com": { body: opaque } })
		const photo = await findPhoto(
			cdnCandidates(subject({ league: "nhl", historyId: "8448000" })),
		)
		expect(photo).toMatchObject({ source: "nhl.com", cutout: false })
	})

	it("asks MLB for the background-removed photo of the player's MLBAM id", async () => {
		const calls = serve({ e_background_removal: { body: cutout } })
		const photo = await findPhoto(
			cdnCandidates(subject({ league: "mlb", historyId: "121578" })),
		)
		expect(photo?.source).toBe("mlbstatic")
		expect(calls[0]).toContain("/people/121578/")
	})
})
