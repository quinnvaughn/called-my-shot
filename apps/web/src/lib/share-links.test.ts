import { describe, expect, it } from "vitest"
import { readShareLanding, tagShareUrl } from "./share-links"

describe("tagShareUrl", () => {
	it("tags the url with the share source, method, campaign and sharer", () => {
		const tagged = new URL(
			tagShareUrl("https://calledmyshot.com/calls/abc", {
				campaign: "call",
				method: "clipboard",
				sharerId: "user-1",
			}),
		)
		expect(tagged.pathname).toBe("/calls/abc")
		expect(tagged.searchParams.get("utm_source")).toBe("share")
		expect(tagged.searchParams.get("utm_medium")).toBe("clipboard")
		expect(tagged.searchParams.get("utm_campaign")).toBe("call")
		expect(tagged.searchParams.get("ref")).toBe("user-1")
	})

	it("leaves the ref off for a signed-out sharer", () => {
		const tagged = new URL(
			tagShareUrl("https://calledmyshot.com/user/quinn", {
				campaign: "profile",
				method: "native",
				sharerId: null,
			}),
		)
		expect(tagged.searchParams.get("utm_source")).toBe("share")
		expect(tagged.searchParams.has("ref")).toBe(false)
	})

	it("keeps the url's own params", () => {
		const tagged = new URL(
			tagShareUrl("https://calledmyshot.com/leagues/nfl/games?windowKey=w5", {
				campaign: "game_picks",
				method: "x",
				sharerId: "user-1",
			}),
		)
		expect(tagged.searchParams.get("windowKey")).toBe("w5")
	})
})

describe("readShareLanding", () => {
	it("reads a tagged href and strips only the share params", () => {
		const { landing, cleanHref } = readShareLanding(
			"/leagues/nfl/games?windowKey=w5&utm_source=share&utm_medium=x&utm_campaign=game_picks&ref=user-1#top",
		)
		expect(landing).toEqual({
			campaign: "game_picks",
			method: "x",
			sharerId: "user-1",
		})
		expect(cleanHref).toBe("/leagues/nfl/games?windowKey=w5#top")
	})

	it("drops the query string entirely when nothing else was in it", () => {
		const { cleanHref } = readShareLanding(
			"/calls/abc?utm_source=share&utm_medium=clipboard&utm_campaign=call",
		)
		expect(cleanHref).toBe("/calls/abc")
	})

	it("leaves a non-share href untouched, email tags included", () => {
		const href =
			"/leagues/nfl/games?utm_source=email&utm_medium=email&utm_campaign=season_start"
		expect(readShareLanding(href)).toEqual({ landing: null, cleanHref: href })
	})

	it("round-trips a tagged url", () => {
		const tagged = new URL(
			tagShareUrl("https://calledmyshot.com/calls/abc", {
				campaign: "call",
				method: "native",
				sharerId: "user-1",
			}),
		)
		const { landing, cleanHref } = readShareLanding(
			`${tagged.pathname}${tagged.search}`,
		)
		expect(landing?.sharerId).toBe("user-1")
		expect(cleanHref).toBe("/calls/abc")
	})
})
