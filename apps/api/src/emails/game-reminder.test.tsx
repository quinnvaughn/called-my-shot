import { describe, expect, it } from "vitest"
import {
	GameReminder,
	gameReminderSubject,
	type ReminderGame,
	startTimeLabel,
} from "./game-reminder"
import { renderEmail } from "./render"

// 1:00pm Eastern on a September Sunday.
const ONE_PM = new Date("2026-09-20T17:00:00.000Z")

function game(overrides: Partial<ReminderGame> = {}): ReminderGame {
	return {
		matchup: "NYJ @ BUF",
		awayTeamName: "New York Jets",
		homeTeamName: "Buffalo Bills",
		leagueAbbr: "NFL",
		startsAt: ONE_PM,
		gameUrl:
			"https://calledmyshot.com/games/1/nfl-new-york-jets-at-buffalo-bills-2026-09-20",
		...overrides,
	}
}

describe("startTimeLabel", () => {
	it("formats in Eastern, not UTC", () => {
		expect(startTimeLabel(ONE_PM)).toBe("1:00 PM ET")
		// 00:20 UTC is still the previous evening in Eastern.
		expect(startTimeLabel(new Date("2026-09-11T00:20:00.000Z"))).toBe(
			"8:20 PM ET",
		)
	})
})

describe("gameReminderSubject", () => {
	it("names the matchup for a single game", () => {
		expect(gameReminderSubject([game()])).toBe("NYJ @ BUF starts at 1:00 PM ET")
	})

	it("counts games that share a start time", () => {
		expect(gameReminderSubject([game(), game({ matchup: "DAL @ PHI" })])).toBe(
			"2 games start at 1:00 PM ET",
		)
	})

	it("gives a range when the batch spans start times", () => {
		const later = new Date(ONE_PM.getTime() + 25 * 60 * 1000)
		expect(
			gameReminderSubject([
				game(),
				game({ matchup: "DAL @ PHI", startsAt: later }),
			]),
		).toBe("2 games start between 1:00 PM ET and 1:25 PM ET")
	})
})

describe("GameReminder", () => {
	it("links every game in the batch", async () => {
		const games = [
			game(),
			game({
				matchup: "DAL @ PHI",
				awayTeamName: "Dallas Cowboys",
				homeTeamName: "Philadelphia Eagles",
				gameUrl:
					"https://calledmyshot.com/games/2/nfl-dallas-cowboys-at-philadelphia-eagles-2026-09-20",
			}),
		]
		const { html, text } = await renderEmail(
			<GameReminder
				games={games}
				manageUrl="https://calledmyshot.com/settings"
				unsubscribeUrl="https://calledmyshot.com/unsubscribe?token=t"
				logoUrl="https://calledmyshot.com/email-logo.png"
			/>,
		)
		for (const g of games) expect(html).toContain(g.gameUrl)
		expect(text).toContain("New York Jets @ Buffalo Bills")
		expect(text).toContain("Dallas Cowboys @ Philadelphia Eagles")
	})
})
