import { describe, expect, it } from "vitest"
import { emailUrl, withUtm } from "./email-links"

describe("email link tagging", () => {
	it("tags a path on the web app", () => {
		expect(
			emailUrl("/leagues/nfl/games", {
				campaign: "season_start",
				content: "hero_games",
			}),
		).toBe(
			"http://localhost:3000/leagues/nfl/games?utm_source=email&utm_medium=email&utm_campaign=season_start&utm_content=hero_games",
		)
	})

	// The question deep-link carries share=1 and the unsubscribe link carries
	// a token - a tagger that rebuilt the query string instead of adding to it
	// would silently drop both.
	it("keeps a url's own query params", () => {
		const tagged = new URL(
			emailUrl("/questions/1/mahomes?share=1", {
				campaign: "resolution_digest",
				content: "hero",
			}),
		)
		expect(tagged.searchParams.get("share")).toBe("1")
		expect(tagged.searchParams.get("utm_campaign")).toBe("resolution_digest")
	})

	it("tags an absolute url that was built elsewhere", () => {
		const tagged = new URL(
			withUtm("https://calledmyshot.com/unsubscribe?token=abc.def", {
				campaign: "season_start",
				content: "unsubscribe",
			}),
		)
		expect(tagged.searchParams.get("token")).toBe("abc.def")
		expect(tagged.searchParams.get("utm_content")).toBe("unsubscribe")
	})
})
