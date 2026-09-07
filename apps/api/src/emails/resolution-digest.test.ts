import { describe, expect, it } from "vitest"
import { renderEmail } from "./render"
import {
	type DigestCall,
	digestSubject,
	ResolutionDigest,
	type ResolutionDigestProps,
} from "./resolution-digest"

function call(overrides: Partial<DigestCall> = {}): DigestCall {
	return {
		questionTitle: "Patrick Mahomes over 275.5 passing yards",
		leagueAbbr: "NFL",
		shapeLabel: "Player Prop",
		pickLabel: "Over 275.5",
		points: 210,
		isWin: true,
		shareUrl: "https://calledmyshot.com/questions/1/mahomes?share=1",
		...overrides,
	}
}

function props(
	calls: DigestCall[],
	overrides: Partial<ResolutionDigestProps> = {},
): ResolutionDigestProps {
	return {
		calls,
		overflowCount: 0,
		primaryShareUrl: calls[0]?.shareUrl ?? "",
		allCallsUrl: "https://calledmyshot.com/my-calls",
		manageUrl: "https://calledmyshot.com/settings",
		unsubscribeUrl: "https://calledmyshot.com/unsubscribe?token=t",
		...overrides,
	}
}

describe("digestSubject", () => {
	it("names the result for a single win", () => {
		expect(digestSubject([call()])).toBe("You called it. +210")
	})

	it("names the result for a single miss", () => {
		expect(digestSubject([call({ points: -40, isWin: false })])).toBe(
			"That one didn't land. −40",
		)
	})

	it("uses a perfect record when nothing missed", () => {
		expect(digestSubject([call(), call({ points: 130 })])).toBe("2 for 2. +340")
	})

	it("uses a shutout record when nothing hit", () => {
		expect(
			digestSubject([
				call({ points: -40, isWin: false }),
				call({ points: -60, isWin: false }),
			]),
		).toBe("0 for 2. −100")
	})

	it("uses win-loss for a mixed batch, netting the points", () => {
		expect(
			digestSubject([
				call(),
				call({ points: 130 }),
				call({ points: -40, isWin: false }),
			]),
		).toBe("You went 2-1 · +300")
	})

	it("reports a net loss even when more calls hit than missed", () => {
		expect(
			digestSubject([
				call({ points: 10 }),
				call({ points: -90, isWin: false }),
			]),
		).toBe("You went 1-1 · −80")
	})
})

describe("ResolutionDigest", () => {
	it("renders both parts with every call and the unsubscribe link", async () => {
		const { html, text } = await renderEmail(
			ResolutionDigest(
				props([
					call(),
					call({ questionTitle: "Bills to win outright", points: 130 }),
					call({
						questionTitle: "Travis Kelce to score a touchdown",
						points: -40,
						isWin: false,
					}),
				]),
			),
		)

		for (const part of [html, text]) {
			expect(part).toContain("Patrick Mahomes over 275.5 passing yards")
			expect(part).toContain("Bills to win outright")
			expect(part).toContain("Travis Kelce to score a touchdown")
			expect(part).toContain("+210")
			expect(part).toContain("−40")
		}
		// The footer link is the difference between an opt-out and a spam
		// complaint, so it has to survive into the plain-text part too.
		expect(text).toContain("https://calledmyshot.com/unsubscribe?token=t")
		expect(text).toContain("https://calledmyshot.com/my-calls")
	})

	it("mentions the calls it didn't list", async () => {
		const { text } = await renderEmail(
			ResolutionDigest(props([call()], { overflowCount: 4 })),
		)
		expect(text).toContain("and 4 more")
	})

	it("omits the overflow line when everything fit", async () => {
		const { text } = await renderEmail(ResolutionDigest(props([call()])))
		expect(text).not.toContain("more.")
	})

	it("points the primary call-to-action at the share panel", async () => {
		const { html } = await renderEmail(
			ResolutionDigest(
				props([call()], {
					primaryShareUrl: "https://calledmyshot.com/questions/9/x?share=1",
				}),
			),
		)
		expect(html).toContain("https://calledmyshot.com/questions/9/x?share=1")
		expect(html).toContain("Grab your card")
	})

	// A digest lists several results but has one hero button, so the button
	// has to say which card it hands over and every row has to offer its own.
	it("gives every call its own card link", async () => {
		const { text } = await renderEmail(
			ResolutionDigest(
				props([
					call({ shareUrl: "https://calledmyshot.com/questions/1/a?share=1" }),
					call({ shareUrl: "https://calledmyshot.com/questions/2/b?share=1" }),
				]),
			),
		)
		expect(text).toContain("https://calledmyshot.com/questions/1/a?share=1")
		expect(text).toContain("https://calledmyshot.com/questions/2/b?share=1")
	})

	it("names which card the hero button gets for a multi-call digest", async () => {
		const mixed = await renderEmail(
			ResolutionDigest(props([call(), call({ points: -40, isWin: false })])),
		)
		expect(mixed.text).toContain("Grab your best card")

		const shutout = await renderEmail(
			ResolutionDigest(
				props([
					call({ points: -40, isWin: false }),
					call({ points: -60, isWin: false }),
				]),
			),
		)
		expect(shutout.text).toContain("Grab your biggest miss")
	})
})
