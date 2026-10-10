import { describe, expect, it } from "vitest"
import { renderUpdateBody } from "./update-body"

describe("renderUpdateBody", () => {
	it("renders markdown headings, links and images", () => {
		const html = renderUpdateBody(
			"## How it works\n\nSee [your home](/home).\n\n![](https://img.example/a.webp)",
		)
		expect(html).toContain("<h2>How it works</h2>")
		expect(html).toContain('<a href="/home">your home</a>')
		expect(html).toContain('<img src="https://img.example/a.webp" alt="">')
	})

	it("shows raw HTML as text instead of rendering it", () => {
		const html = renderUpdateBody('<script>alert("x")</script>')
		expect(html).not.toContain("<script>")
		expect(html).toContain("&lt;script&gt;")
	})
})
