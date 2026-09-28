import type { CallGif, CallGifState } from "@called-my-shot/gifs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { emptyGifPools, loadGifHealth } from "./gif-health"

const STATES: CallGifState[] = [
	"voided",
	"pending",
	"nailed",
	"should_have_stuck",
	"never_in_doubt",
	"by_a_hair",
	"called_it",
	"inches_away",
	"way_off",
	"missed",
]

// The real pools ship empty and get filled by hand, so these run against a
// known set instead - otherwise every assertion here would pass by checking
// nothing.
function pools(
	filled: Partial<Record<CallGifState, CallGif[]>>,
): Record<CallGifState, readonly CallGif[]> {
	const out = {} as Record<CallGifState, readonly CallGif[]>
	for (const state of STATES) out[state] = filled[state] ?? []
	return out
}

function res(status: number) {
	return { status, ok: status >= 200 && status < 300 } as Response
}

beforeEach(() => {
	vi.restoreAllMocks()
})

describe("loadGifHealth", () => {
	it("reports a url the host still serves as ok", async () => {
		vi.spyOn(global, "fetch").mockResolvedValue(res(200))

		const rows = await loadGifHealth(
			pools({ called_it: [{ url: "https://cdn/a.gif", alt: "a" }] }),
		)
		expect(rows).toHaveLength(1)
		expect(rows[0]).toMatchObject({ state: "called_it", status: 200, ok: true })
	})

	it("reports a 404 as broken without throwing", async () => {
		vi.spyOn(global, "fetch").mockResolvedValue(res(404))

		const rows = await loadGifHealth(
			pools({ missed: [{ url: "https://cdn/gone.gif", alt: "gone" }] }),
		)
		expect(rows[0]).toMatchObject({ status: 404, ok: false, error: null })
	})

	// A CDN refusing HEAD while serving the asset over GET is a quirk, not a
	// dead link, and reporting it as one sends someone replacing a gif that
	// works fine.
	it("retries a HEAD-refusing host with a ranged GET", async () => {
		const fetchMock = vi
			.spyOn(global, "fetch")
			.mockResolvedValueOnce(res(405))
			.mockResolvedValueOnce(res(206))

		const rows = await loadGifHealth(
			pools({ nailed: [{ url: "https://cdn/picky.gif", alt: "picky" }] }),
		)
		expect(rows[0]).toMatchObject({ status: 206, ok: true })
		expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "HEAD" })
		expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "GET" })
	})

	// Null status, not a status of 0: nothing answered at all, which is a
	// different fact from a host answering "gone".
	it("reports a transport failure with no status", async () => {
		vi.spyOn(global, "fetch").mockRejectedValue(new Error("timed out"))

		const rows = await loadGifHealth(
			pools({ way_off: [{ url: "https://cdn/slow.gif", alt: "slow" }] }),
		)
		expect(rows[0]).toMatchObject({ status: null, ok: false })
		expect(rows[0]?.error).toBe("timed out")
	})

	it("keeps checking the rest after one url fails", async () => {
		vi.spyOn(global, "fetch").mockImplementation(async (input) =>
			String(input).includes("2.gif")
				? Promise.reject(new Error("boom"))
				: res(200),
		)

		const rows = await loadGifHealth(
			pools({
				called_it: [
					{ url: "https://cdn/1.gif", alt: "one" },
					{ url: "https://cdn/2.gif", alt: "two" },
				],
				missed: [{ url: "https://cdn/3.gif", alt: "three" }],
			}),
		)
		expect(rows).toHaveLength(3)
		expect(rows.filter((r) => r.ok)).toHaveLength(2)
	})

	it("puts the broken rows first", async () => {
		vi.spyOn(global, "fetch").mockImplementation(async (input) =>
			res(String(input).includes("bad") ? 404 : 200),
		)

		const rows = await loadGifHealth(
			pools({
				called_it: [{ url: "https://cdn/ok.gif", alt: "ok" }],
				missed: [{ url: "https://cdn/bad.gif", alt: "bad" }],
			}),
		)
		expect(rows[0]?.ok).toBe(false)
		expect(rows[1]?.ok).toBe(true)
	})
})

describe("emptyGifPools", () => {
	it("names the states that would render nothing", () => {
		const empty = emptyGifPools(
			pools({ called_it: [{ url: "https://cdn/a.gif", alt: "a" }] }),
		)
		expect(empty).not.toContain("called_it")
		expect(empty).toContain("missed")
		expect(empty).toHaveLength(STATES.length - 1)
	})
})
