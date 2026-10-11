import { describe, expect, it } from "vitest"
import { renderEmail } from "./render"
import {
	heroTarget,
	kickoffPhrase,
	SeasonStart,
	type SeasonStartProps,
	seasonStartPreview,
	seasonStartSubject,
} from "./season-start"

// A Sunday morning in Eastern, so every offset below lands on a predictable
// weekday and none of the assertions depend on when the suite runs.
const NOW = new Date("2026-09-06T13:00:00.000Z")
// The real 2026 NFL opener - a Wednesday night, three days out from NOW.
const KICKOFF = new Date("2026-09-09T00:20:00.000Z")

function props(overrides: Partial<SeasonStartProps> = {}): SeasonStartProps {
	return {
		leagueName: "NFL",
		seasonDisplayName: "2026",
		startsAt: KICKOFF,
		now: NOW,
		openingLabel: "Week 1",
		gameCount: 16,
		ballotCount: 6,
		gamesUrl:
			"https://calledmyshot.com/leagues/nfl/games?utm_content=games_row",
		seasonUrl:
			"https://calledmyshot.com/leagues/nfl/ballots?utm_content=season_row",
		heroUrl:
			"https://calledmyshot.com/leagues/nfl/games?utm_content=hero_games",
		manageUrl: "https://calledmyshot.com/settings",
		unsubscribeUrl: "https://calledmyshot.com/unsubscribe?token=t",
		logoUrl: "https://calledmyshot.com/email-logo.png",
		...overrides,
	}
}

const days = (n: number) =>
	new Date(KICKOFF.getTime() - n * 24 * 60 * 60 * 1000)

describe("kickoffPhrase", () => {
	it("names the weekday inside the coming week and dates it past that", () => {
		// KICKOFF is 8:20pm ET on Tuesday the 8th, not the UTC Wednesday the
		// timestamp reads as - the whole reason this formats in Eastern.
		expect(kickoffPhrase({ startsAt: KICKOFF, now: days(3) })).toBe("Tuesday")
		expect(kickoffPhrase({ startsAt: KICKOFF, now: days(7) })).toBe(
			"Tuesday, Sep 8",
		)
	})

	it("says tomorrow and today rather than naming the day", () => {
		expect(kickoffPhrase({ startsAt: KICKOFF, now: days(1) })).toBe("tomorrow")
		expect(kickoffPhrase({ startsAt: KICKOFF, now: days(0) })).toBe("today")
	})

	// "tomorrow" is a property of the calendar date, not of elapsed hours -
	// a late-evening send about an early-afternoon kickoff is under 24 hours
	// out and still tomorrow.
	it("counts calendar days, not elapsed hours", () => {
		expect(
			kickoffPhrase({
				// 1pm ET Wednesday, sent 11pm ET Tuesday - 14 hours apart.
				startsAt: new Date("2026-09-09T17:00:00.000Z"),
				now: new Date("2026-09-09T03:00:00.000Z"),
			}),
		).toBe("tomorrow")
	})
})

describe("seasonStartSubject", () => {
	it("names the league and when, and nothing else", () => {
		expect(seasonStartSubject(props())).toBe("NFL is back Tuesday.")
		expect(seasonStartSubject({ ...props(), now: days(1) })).toBe(
			"NFL is back tomorrow.",
		)
	})
})

describe("seasonStartPreview", () => {
	it("counts what's actually open", () => {
		expect(
			seasonStartPreview({
				openingLabel: "Week 1",
				gameCount: 16,
				ballotCount: 6,
			}),
		).toBe("16 games on the Week 1 slate, plus 6 award ballots.")
	})

	it("drops the half that has nothing behind it", () => {
		expect(
			seasonStartPreview({
				openingLabel: "opening day",
				gameCount: 11,
				ballotCount: 0,
			}),
		).toBe("11 games on the opening day slate, waiting to be called.")
		expect(
			seasonStartPreview({
				openingLabel: "Week 1",
				gameCount: 0,
				ballotCount: 4,
			}),
		).toBe("4 award ballots are open.")
	})

	it("singularises a lone game or ballot", () => {
		expect(
			seasonStartPreview({
				openingLabel: "Week 1",
				gameCount: 1,
				ballotCount: 1,
			}),
		).toBe("1 game on the Week 1 slate, plus 1 award ballot.")
	})
})

// The button has to point somewhere with something behind it - a hero
// pointing at an empty games tab is worse than no hero at all.
describe("heroTarget", () => {
	it("prefers games and falls back to the ballots", () => {
		expect(heroTarget({ gameCount: 16 })).toBe("games")
		expect(heroTarget({ gameCount: 0 })).toBe("season")
	})
})

describe("SeasonStart", () => {
	it("renders both parts with both actions and the unsubscribe link", async () => {
		const { html, text } = await renderEmail(SeasonStart(props()))
		// Copy is asserted against the plain-text part only: react-email splits
		// every interpolation in the HTML with a `<!-- -->` marker, so a
		// sentence built from props is never contiguous there. Both parts come
		// off the same element tree (see render.ts), so one is enough.
		expect(text).toContain("The NFL season starts Tuesday")
		expect(text).toContain("16 games on the board")
		expect(text).toContain("6 award ballots open now")
		// The one claim in here that is a scoring rule, not a count: awards run
		// to the end of the season and a preseason call takes the 3x ceiling
		// from seasonEarlyTierFor. Asserted so a copy edit can't quietly
		// contradict packages/scoring.
		expect(text).toContain("run until the season ends")
		expect(text).toContain("scores 3x")
		expect(text).toContain("Call the Week 1 games")
		// The footer names the real trigger, not the digest's.
		expect(text).toContain("the NFL season is about to start")
		expect(text).not.toContain("a call of yours just resolved")

		// Urls are single prop values, so they do survive intact in the HTML -
		// worth checking there, since that's the part most people click in.
		for (const part of [html, text]) {
			expect(part).toContain("https://calledmyshot.com/unsubscribe?token=t")
			expect(part).toContain("utm_content=hero_games")
			expect(part).toContain("utm_content=season_row")
		}
	})

	it("drops the games section and re-points the button when nothing is scheduled", async () => {
		const { text } = await renderEmail(
			SeasonStart(
				props({
					gameCount: 0,
					heroUrl: "https://calledmyshot.com/leagues/nfl/ballots",
				}),
			),
		)
		expect(text).not.toContain("Who wins?")
		expect(text).toContain("Open the season ballots")
	})

	it("drops the ballots section when none are published", async () => {
		const { text } = await renderEmail(SeasonStart(props({ ballotCount: 0 })))
		expect(text).not.toContain("award ballot")
		expect(text).toContain("Who wins?")
	})
})
