import { describe, expect, it } from "vitest"
import { renderEmail } from "./render"
import {
	type DigestCall,
	digestPreview,
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
		primaryShareUrl: calls[0]?.shareUrl ?? "",
		allCallsUrl: "https://calledmyshot.com/my-calls",
		manageUrl: "https://calledmyshot.com/settings",
		unsubscribeUrl: "https://calledmyshot.com/unsubscribe?token=t",
		logoUrl: "https://calledmyshot.com/email-logo.png",
		...overrides,
	}
}

// The subject deliberately withholds the result - answering it in the inbox
// gives someone every reason to read and never open, and the card they can
// share is inside. The body still leads with the record (asserted below).
describe("digestSubject", () => {
	it("invites rather than answering", () => {
		const win = digestSubject([call()])
		const loss = digestSubject([call({ points: -40, isWin: false })])
		expect(win).toBe("Your call is in.")
		// A single call reads identically whether it hit or missed - nothing
		// about the outcome leaks into the inbox.
		expect(loss).toBe(win)
	})

	it("counts the calls without scoring them", () => {
		expect(digestSubject([call(), call(), call()])).toBe("Your 3 calls are in.")
	})

	it("never leaks the outcome into subject or preheader", () => {
		const rough = [
			call({ points: -90, isWin: false }),
			call({ points: -80, isWin: false }),
		]
		const inbox = `${digestSubject(rough)} ${digestPreview(rough)}`
		for (const tell of ["-", "\u2212", "point", "went", "for 2", "miss"]) {
			expect(inbox.toLowerCase()).not.toContain(tell.toLowerCase())
		}
	})

	it("names the standout call in the preheader", () => {
		const calls = [
			call({ questionTitle: "Bills to win outright", points: 200 }),
			call({ questionTitle: "Jets ML", points: -10, isWin: false }),
		]
		expect(digestPreview(calls)).toBe("Starting with Bills to win outright.")
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

	// The cap is a display concern only. Everything the email asserts - the
	// record, the net, which call is the standout - has to describe the whole
	// batch, or a 12-call Sunday reports the record of its first 8.
	it("lists at most 8 calls and counts the rest", async () => {
		const twelve = Array.from({ length: 12 }, (_, i) =>
			call({ questionTitle: `Call number ${i + 1}`, points: 10 - i }),
		)
		const { text } = await renderEmail(ResolutionDigest(props(twelve)))
		expect(text).toContain("Call number 8")
		expect(text).not.toContain("Call number 9")
		expect(text).toContain("and 4 more")
	})

	it("reports the record and net across every call, not just the listed ones", async () => {
		const twelve = [
			...Array.from({ length: 3 }, () => call({ points: 100 })),
			...Array.from({ length: 9 }, () => call({ points: -50, isWin: false })),
		]
		const { text } = await renderEmail(ResolutionDigest(props(twelve)))
		// 3-9 and -150 across all twelve - not the 3-5 that summing the list
		// after slicing it to eight rows used to report.
		expect(text).toContain("You went 3-9.")
		expect(text).toContain("−150 pts")
	})

	it("omits the overflow line when everything fit", async () => {
		const { text } = await renderEmail(ResolutionDigest(props([call()])))
		expect(text).not.toContain("more.")
	})

	it("does not repeat the subject in the preheader", async () => {
		const calls = [call(), call({ points: -40, isWin: false })]
		expect(digestPreview(calls)).not.toContain(digestSubject(calls))
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
		expect(html).toContain("Share this call")
	})

	// "Card" is what we call the image internally; someone reading their first
	// result email has never opened the share panel and wouldn't know the word.
	it("says what sharing gets you without calling it a card", async () => {
		const { html, text } = await renderEmail(ResolutionDigest(props([call()])))
		expect(text).toContain("an image of it you can post anywhere")
		expect(html.toLowerCase()).not.toContain("your card")
	})

	it("shows the real wordmark rather than a text stand-in", async () => {
		const { html } = await renderEmail(ResolutionDigest(props([call()])))
		expect(html).toContain("https://calledmyshot.com/email-logo.png")
		expect(html).toContain('alt="Called My Shot"')
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
		expect(mixed.text).toContain("Share your best call")

		const shutout = await renderEmail(
			ResolutionDigest(
				props([
					call({ points: -40, isWin: false }),
					call({ points: -60, isWin: false }),
				]),
			),
		)
		expect(shutout.text).toContain("Share your biggest miss")
	})
})
