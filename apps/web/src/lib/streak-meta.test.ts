import { describe, expect, it } from "vitest"
import {
	buildStreakTweet,
	buildSweepTweet,
	formatSlateDates,
	milestoneNudge,
	ordinal,
	parseStreakFamilyParam,
	streakCardVersion,
	streakPageMeta,
	streakPath,
	streakStakeText,
	sweepCardVersion,
	sweepPageMeta,
	sweepPath,
} from "./streak-meta"

const streak = { track: "NFL Player Stats", currentLength: 7, bestLength: 7 }

describe("buildStreakTweet", () => {
	it("speaks in the first person about your own streak", () => {
		expect(buildStreakTweet({ ...streak, isOwn: true })).toBe(
			"7 in a row on NFL Player Stats.",
		)
		expect(buildStreakTweet({ ...streak, bestLength: 9, isOwn: true })).toBe(
			"7 in a row on NFL Player Stats. My best is 9.",
		)
		expect(
			buildStreakTweet({
				...streak,
				currentLength: 0,
				bestLength: 9,
				isOwn: true,
			}),
		).toBe("My best on NFL Player Stats: 9 in a row.")
	})

	// A streak page is public. First-person text on someone else's page would
	// put the sharer on X claiming a run they didn't make.
	it("attributes someone else's streak to them", () => {
		expect(
			buildStreakTweet({ ...streak, isOwn: false, username: "quinn" }),
		).toBe("@quinn is 7 in a row on NFL Player Stats.")
		expect(
			buildStreakTweet({
				...streak,
				bestLength: 9,
				isOwn: false,
				username: "quinn",
			}),
		).toBe("@quinn is 7 in a row on NFL Player Stats. Best is 9.")
		expect(
			buildStreakTweet({
				...streak,
				currentLength: 0,
				bestLength: 9,
				isOwn: false,
				username: "quinn",
			}),
		).toBe("@quinn's best on NFL Player Stats: 9 in a row.")
	})
})

describe("buildSweepTweet", () => {
	const sweep = { track: "NFL Week 3 Sunday Early", gameCount: 9 }

	it("speaks in the first person on your own sweep", () => {
		expect(buildSweepTweet({ ...sweep, isOwn: true })).toBe(
			"Picked every NFL Week 3 Sunday Early winner. 9 for 9.",
		)
	})

	it("attributes someone else's sweep to them", () => {
		expect(buildSweepTweet({ ...sweep, isOwn: false, username: "quinn" })).toBe(
			"@quinn picked every NFL Week 3 Sunday Early winner. 9 for 9.",
		)
	})
})

describe("streakPageMeta", () => {
	it("states the live run in the title and every card number below", () => {
		expect(
			streakPageMeta({
				...streak,
				bestLength: 9,
				username: "quinn",
				runStartedAt: "Sep 3, 2026",
			}),
		).toEqual({
			title: "@quinn is 7 in a row on NFL Player Stats",
			description: "7 in a row · Best run of 9 · Run started Sep 3, 2026.",
		})
	})

	it("names an ended run as a best, never as live", () => {
		const { title, description } = streakPageMeta({
			...streak,
			currentLength: 0,
			bestLength: 9,
			username: "quinn",
			runStartedAt: null,
		})
		expect(title).toBe("@quinn's best on NFL Player Stats: 9 in a row")
		expect(description).toBe("No current run · Best run of 9.")
	})
})

describe("sweepPageMeta", () => {
	it("states the slate, the record, the points and the date", () => {
		expect(
			sweepPageMeta({
				track: "NFL Week 3 Sunday Early",
				gameCount: 9,
				username: "quinn",
				points: 240,
				dates: "Sep 20, 2026",
			}),
		).toEqual({
			title: "@quinn picked every NFL Week 3 Sunday Early winner: 9 for 9",
			description: "9 games · 9–0 · +240 pts · Sep 20, 2026.",
		})
	})

	it("leaves out points until they are final", () => {
		const { description } = sweepPageMeta({
			track: "MLB Sep 14",
			gameCount: 15,
			username: "quinn",
			points: null,
			dates: "Sep 14, 2026",
		})
		expect(description).toBe("15 games · 15–0 · Sep 14, 2026.")
	})
})

describe("card versions", () => {
	it("changes whenever a number on the streak card does", () => {
		const v = streakCardVersion({
			currentLength: 7,
			bestLength: 9,
			lastHitCallId: "aaaaaaaa-1111",
		})
		expect(
			streakCardVersion({
				currentLength: 8,
				bestLength: 9,
				lastHitCallId: "aaaaaaaa-1111",
			}),
		).not.toBe(v)
		expect(
			streakCardVersion({
				currentLength: 7,
				bestLength: 10,
				lastHitCallId: "aaaaaaaa-1111",
			}),
		).not.toBe(v)
		expect(
			streakCardVersion({
				currentLength: 7,
				bestLength: 9,
				lastHitCallId: "bbbbbbbb-2222",
			}),
		).not.toBe(v)
	})

	it("changes when a sweep's points settle or its game count moves", () => {
		const pending = sweepCardVersion({ gameCount: 9, points: null })
		expect(sweepCardVersion({ gameCount: 9, points: 240 })).not.toBe(pending)
		expect(sweepCardVersion({ gameCount: 8, points: null })).not.toBe(pending)
	})
})

describe("paths", () => {
	it("round-trips the family through its url form", () => {
		expect(streakPath("quinn", "nfl", "PLAYER_STATS", "hot")).toBe(
			"/user/quinn/streaks/nfl/player_stats/hot",
		)
		expect(streakPath("quinn", "nfl", "PLAYER_STATS", "cold")).toBe(
			"/user/quinn/streaks/nfl/player_stats/cold",
		)
		expect(parseStreakFamilyParam("player_stats")).toBe("PLAYER_STATS")
		expect(parseStreakFamilyParam("PLAYER_STATS")).toBeNull()
		expect(parseStreakFamilyParam("parlays")).toBeNull()
		expect(sweepPath("quinn", "nfl", "2026-reg-w3-sun-early")).toBe(
			"/user/quinn/sweeps/nfl/2026-reg-w3-sun-early",
		)
	})
})

describe("ordinal", () => {
	it("suffixes teens and tens correctly", () => {
		expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual(
			[
				"1st",
				"2nd",
				"3rd",
				"4th",
				"11th",
				"12th",
				"13th",
				"21st",
				"22nd",
				"23rd",
				"101st",
				"111th",
			],
		)
	})
})

describe("formatSlateDates", () => {
	it("states one ET day, including a game that starts after UTC midnight", () => {
		expect(
			formatSlateDates(["2026-09-14T23:00:00Z", "2026-09-15T02:10:00Z"]),
		).toEqual({ text: "Sep 14, 2026", multiDay: false })
	})

	it("states a range across months", () => {
		expect(
			formatSlateDates(["2026-10-01T17:00:00Z", "2026-09-30T17:00:00Z"]),
		).toEqual({ text: "Sep 30 to Oct 1, 2026", multiDay: true })
	})
})

describe("milestoneNudge", () => {
	it("nudges a live run one or two calls from its next milestone", () => {
		expect(milestoneNudge(9, 10)).toBe("One more for 10 in a row.")
		expect(milestoneNudge(8, 10)).toBe("2 more for 10 in a row.")
	})

	it("says nothing further out, or with no run going", () => {
		expect(milestoneNudge(7, 10)).toBeNull()
		expect(milestoneNudge(0, 5)).toBeNull()
	})
})

describe("streakStakeText", () => {
	it("warns that a miss ends a run below its best", () => {
		expect(
			streakStakeText({
				track: "NFL Player Stats",
				currentLength: 6,
				bestLength: 9,
			}),
		).toBe("You're 6 in a row on NFL Player Stats. A miss ends it.")
	})

	it("says one more sets the best when the run is already level with it", () => {
		expect(
			streakStakeText({
				track: "NFL Player Stats",
				currentLength: 6,
				bestLength: 6,
			}),
		).toBe("You're 6 in a row on NFL Player Stats. One more sets your best.")
	})
})
