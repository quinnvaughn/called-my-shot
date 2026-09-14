import { describe, expect, it } from "vitest"
import { callPageMeta } from "./call-meta"

const base = {
	username: "quinn",
	pickLabel: "Chicago Bears",
	questionTitle: "Who will win?",
	game: {
		awayTeam: { id: "a", abbreviation: "CHI" },
		homeTeam: { id: "h", abbreviation: "GB" },
	},
	leagueAbbr: "NFL",
	shapeLabel: "Game Outcome",
	conviction: 85,
	points: 240,
	isWin: true,
	exact: false,
	questionStatus: "RESOLVED" as const,
	calledAt: "Mar 3, 2026",
	locksAt: "Mar 8, 2026",
	resolvedAt: "Mar 9, 2026",
	caseText: null,
}

describe("callPageMeta", () => {
	it("leads with the status, then the points and the matchup", () => {
		expect(callPageMeta(base).title).toBe(
			"Won: @quinn called Chicago Bears (+240 pts) | CHI @ GB · Who will win?",
		)
	})

	it("states a loss with negative points", () => {
		const { title } = callPageMeta({ ...base, points: -120, isWin: false })
		expect(title).toBe(
			"Lost: @quinn called Chicago Bears (−120 pts) | CHI @ GB · Who will win?",
		)
	})

	it("says an exact numeric guess landed exactly", () => {
		const { title } = callPageMeta({
			...base,
			pickLabel: "13",
			questionTitle: "How many wins will Chicago have in 2026?",
			game: null,
			exact: true,
		})
		expect(title).toBe(
			"Won: @quinn nailed 13 exactly (+240 pts) | How many wins will Chicago have in 2026?",
		)
	})

	it("claims no outcome on a pending call", () => {
		const { title, description } = callPageMeta({
			...base,
			points: null,
			isWin: null,
			questionStatus: "OPEN",
			resolvedAt: null,
		})
		expect(title).toBe(
			"Pending: @quinn called Chicago Bears | CHI @ GB · Who will win?",
		)
		expect(title).not.toContain("pts")
		expect(description).toBe(
			"NFL Game Outcome · 85% conviction · Called Mar 3, 2026, locks Mar 8, 2026.",
		)
	})

	it("marks a voided call", () => {
		const { title, description } = callPageMeta({
			...base,
			points: null,
			isWin: null,
			questionStatus: "VOIDED",
			resolvedAt: null,
		})
		expect(title.startsWith("Voided: ")).toBe(true)
		expect(description).toContain("voided")
	})

	it("quotes the case, capped", () => {
		const { description } = callPageMeta({
			...base,
			caseText: "Their secondary is banged up. ".repeat(20),
		})
		expect(
			description.startsWith(
				'NFL Game Outcome · 85% conviction · Called Mar 3, 2026, resolved Mar 9, 2026. "Their secondary',
			),
		).toBe(true)
		expect(description.endsWith('…"')).toBe(true)
		expect(description.length).toBeLessThan(260)
	})
})
