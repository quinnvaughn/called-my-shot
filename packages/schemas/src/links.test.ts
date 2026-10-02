import { describe, expect, it } from "vitest"
import { describeLink, linksSchema, normalizeLinkUrl } from "./links"

describe("normalizeLinkUrl", () => {
	it("adds https to a pasted bare domain", () => {
		expect(normalizeLinkUrl("instagram.com/celticstalk")).toBe(
			"https://instagram.com/celticstalk",
		)
	})

	it("drops trailing slashes and fragments so duplicates compare equal", () => {
		expect(normalizeLinkUrl("https://x.com/celtics/")).toBe(
			"https://x.com/celtics",
		)
		expect(normalizeLinkUrl("example.com/")).toBe("https://example.com")
		expect(normalizeLinkUrl("example.com/about#team")).toBe(
			"https://example.com/about",
		)
	})

	it("keeps query strings", () => {
		expect(normalizeLinkUrl("youtube.com/watch?v=abc")).toBe(
			"https://youtube.com/watch?v=abc",
		)
	})

	it("refuses anything that isn't a web address", () => {
		expect(normalizeLinkUrl("javascript:alert(1)")).toBeNull()
		expect(normalizeLinkUrl("mailto:hi@example.com")).toBeNull()
		expect(normalizeLinkUrl("not a link")).toBeNull()
		expect(normalizeLinkUrl("localhost")).toBeNull()
		expect(normalizeLinkUrl("https://user:pw@example.com")).toBeNull()
		expect(normalizeLinkUrl("   ")).toBeNull()
	})
})

describe("describeLink", () => {
	it("recognises a profile and labels it with the handle", () => {
		expect(describeLink("https://x.com/celtics")).toEqual({
			platform: "x",
			label: "@celtics",
		})
		expect(describeLink("https://www.instagram.com/celtics")).toEqual({
			platform: "instagram",
			label: "@celtics",
		})
		expect(describeLink("https://www.tiktok.com/@celtics")).toEqual({
			platform: "tiktok",
			label: "@celtics",
		})
		expect(describeLink("https://bsky.app/profile/celtics.bsky.social")).toEqual(
			{ platform: "bluesky", label: "@celtics.bsky.social" },
		)
		expect(describeLink("https://reddit.com/r/bostonceltics")).toEqual({
			platform: "reddit",
			label: "r/bostonceltics",
		})
		expect(describeLink("https://celtics.substack.com")).toEqual({
			platform: "substack",
			label: "celtics",
		})
	})

	it("matches old and mobile hostnames", () => {
		expect(describeLink("https://twitter.com/celtics").platform).toBe("x")
		expect(describeLink("https://m.youtube.com/@celtics")).toEqual({
			platform: "youtube",
			label: "@celtics",
		})
	})

	it("falls back to the platform name when the url isn't a profile", () => {
		expect(describeLink("https://x.com/celtics/status/123")).toEqual({
			platform: "x",
			label: "X",
		})
		expect(describeLink("https://discord.gg/abc123")).toEqual({
			platform: "discord",
			label: "Discord",
		})
		expect(describeLink("https://www.youtube.com/watch?v=abc").label).toBe(
			"YouTube",
		)
	})

	it("treats anything unrecognised as a website labelled by its host", () => {
		expect(describeLink("https://www.celticstalk.com/about")).toEqual({
			platform: "website",
			label: "celticstalk.com",
		})
	})

	it("doesn't mistake a lookalike domain for a platform", () => {
		expect(describeLink("https://notx.com/celtics").platform).toBe("website")
	})

	it("prefers the owner's label", () => {
		expect(describeLink("https://shop.example.com", "Merch")).toEqual({
			platform: "website",
			label: "Merch",
		})
		expect(describeLink("https://x.com/celtics", "Team account").label).toBe(
			"Team account",
		)
	})
})

describe("linksSchema", () => {
	it("normalizes urls and rejects duplicates after normalizing", () => {
		const result = linksSchema.safeParse([
			{ url: "x.com/celtics" },
			{ url: "https://x.com/celtics/" },
		])
		expect(result.success).toBe(false)
		expect(result.error?.issues[0]?.path).toEqual([1, "url"])
	})

	it("rejects an invalid url on its own field", () => {
		const result = linksSchema.safeParse([{ url: "javascript:alert(1)" }])
		expect(result.success).toBe(false)
		expect(result.error?.issues[0]?.path).toEqual([0, "url"])
	})

	it("caps the number of links", () => {
		const links = Array.from({ length: 7 }, (_, i) => ({
			url: `example${i}.com`,
		}))
		expect(linksSchema.safeParse(links).success).toBe(false)
	})
})
