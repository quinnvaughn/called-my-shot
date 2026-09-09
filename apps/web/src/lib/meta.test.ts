import { describe, expect, it } from "vitest"
import { pageMeta, SITE_ORIGIN } from "./meta"

function contentOf(
	meta: ReturnType<typeof pageMeta>["meta"],
	key: string,
): string | undefined {
	const entry = meta.find(
		(m) =>
			("property" in m && m.property === key) ||
			("name" in m && m.name === key),
	)
	return entry && "content" in entry ? entry.content : undefined
}

const base = {
	title: "@quinn called Over 275.5",
	description: "+240 pts · NFL · called Mar 3, 2026.",
	path: "/calls/abc",
}

describe("pageMeta", () => {
	it("emits no image tags when none is given", () => {
		const { meta } = pageMeta(base)
		for (const key of ["og:image", "twitter:image", "og:image:width"]) {
			expect(contentOf(meta, key)).toBeUndefined()
		}
		// The root's site-wide graphic and card type are what apply then.
		expect(contentOf(meta, "twitter:card")).toBeUndefined()
	})

	it("emits absolute image urls and the size crawlers reserve space with", () => {
		const { meta } = pageMeta({
			...base,
			image: { path: "/share/calls/abc.png", alt: "quinn's call" },
		})
		const absolute = `${SITE_ORIGIN}/share/calls/abc.png`
		expect(contentOf(meta, "og:image")).toBe(absolute)
		expect(contentOf(meta, "twitter:image")).toBe(absolute)
		expect(contentOf(meta, "og:image:width")).toBe("1200")
		expect(contentOf(meta, "og:image:height")).toBe("630")
		expect(contentOf(meta, "og:image:alt")).toBe("quinn's call")
		expect(contentOf(meta, "twitter:card")).toBe("summary_large_image")
	})

	it("keeps canonical and og:url absolute and in agreement", () => {
		const { links, meta } = pageMeta(base)
		expect(links[0]).toEqual({
			rel: "canonical",
			href: `${SITE_ORIGIN}/calls/abc`,
		})
		expect(contentOf(meta, "og:url")).toBe(`${SITE_ORIGIN}/calls/abc`)
	})
})
