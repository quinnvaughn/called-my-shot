import { describe, expect, it } from "vitest"
import { db } from "../../db"
import { ballotQuestions, ballots, ballotTiebreaks } from "../../db/schema"
import {
	futureDate,
	makeCall,
	makeLeague,
	makeQuestion,
	makeSeason,
	makeStat,
	makeTeam,
	makeUser,
} from "../../test/factories"
import { textNodes } from "../../test/helpers"
import { buildBallotShareCard, loadBallotShareCardData } from "./ballot-card"

const base = {
	ballotName: "2026 Win Totals",
	leagueAbbr: "NFL",
	name: "Quinn Vaughn",
	username: "quinn",
	calledCount: 32,
	memberCount: 32,
	wins: 0,
	losses: 0,
	points: 0,
	pendingLabel: "Locks Oct 8, 2026",
}

const team = (abbreviation: string, wins: number) => ({
	abbreviation,
	color: "#000000",
	logo: null,
	wins,
	losses: 17 - wins,
})

describe("buildBallotShareCard", () => {
	it("shows the top of each conference side by side", () => {
		const texts = textNodes(
			buildBallotShareCard({
				...base,
				standings: {
					conferences: [
						{ label: "AFC", teams: [team("KC", 14), team("BAL", 13)] },
						{ label: "NFC", teams: [team("PHI", 13)] },
					],
				},
			}),
		)
		expect(texts).toContain("NFL · 2026 Win Totals")
		expect(texts).toContain("Quinn Vaughn's projected standings")
		expect(texts).toContain("AFC")
		expect(texts).toContain("KC")
		expect(texts).toContain("14-3")
		expect(texts).toContain("NFC")
		expect(texts).toContain("32 of 32")
	})

	it("keeps the plain card without standings", () => {
		const texts = textNodes(buildBallotShareCard(base))
		expect(texts).toContain("NFL · Ballot")
		expect(texts).toContain("Quinn Vaughn's picks")
		expect(texts).toContain("2026 Win Totals")
	})
})

describe("loadBallotShareCardData standings", () => {
	// An NFL win-totals ballot with the given teams per conference, and a user
	// who picked the wins listed for each (null = not picked).
	async function seed(conferences: Record<string, Record<string, number | null>>) {
		const league = await makeLeague({ slug: "nfl" })
		const season = await makeSeason({ leagueId: league.id })
		const stat = await makeStat({ sportId: league.sportId, name: "Wins" })
		const [ballot] = await db
			.insert(ballots)
			.values({
				name: "2026 Win Totals",
				slug: `win-totals-${league.slug}`,
				sportId: league.sportId,
				leagueId: league.id,
				seasonId: season.id,
				status: "published",
				publishedAt: new Date(),
			})
			.returning()
		if (!ballot) throw new Error("ballot insert returned no row")
		const user = await makeUser()

		const questionIds: Record<string, string> = {}
		let sortOrder = 0
		for (const [conference, teams] of Object.entries(conferences)) {
			for (const [abbreviation, wins] of Object.entries(teams)) {
				const subject = await makeTeam({
					leagueId: league.id,
					abbreviation,
					name: abbreviation,
					conference,
					division: "East",
				})
				const question = await makeQuestion({
					leagueId: league.id,
					seasonId: season.id,
					shape: "team_season_stat_numeric_guess",
					statId: stat.id,
					subjectTeamId: subject.id,
					locksAt: futureDate(24),
				})
				await db.insert(ballotQuestions).values({
					ballotId: ballot.id,
					questionId: question.id,
					label: abbreviation,
					sortOrder: sortOrder++,
				})
				if (wins !== null) {
					await makeCall(question.id, user.id, { guessValue: wins })
				}
				questionIds[abbreviation] = question.id
			}
		}
		return { ballot, user, questionIds }
	}

	it("takes the best three per conference, applying the user's tie order", async () => {
		const { ballot, user, questionIds } = await seed({
			AFC: { KC: 14, BAL: 12, BUF: 12, NE: 4 },
			NFC: { PHI: 13, DET: 11, SF: 10, NYG: null },
		})
		await db.insert(ballotTiebreaks).values([
			{ ballotId: ballot.id, userId: user.id, questionId: questionIds.BUF, position: 0 },
			{ ballotId: ballot.id, userId: user.id, questionId: questionIds.BAL, position: 1 },
		])

		const data = await loadBallotShareCardData(ballot.slug, user.username)
		expect(
			data?.standings?.conferences.map((c) => [
				c.label,
				c.teams.map((t) => `${t.abbreviation} ${t.wins}-${t.losses}`),
			]),
		).toEqual([
			["AFC", ["KC 14-3", "BUF 12-5", "BAL 12-5"]],
			["NFC", ["PHI 13-4", "DET 11-6", "SF 10-7"]],
		])
	})

	it("waits for three picks in every conference", async () => {
		const { ballot, user } = await seed({
			AFC: { KC: 14, BAL: 12, BUF: 12 },
			NFC: { PHI: 13, DET: 11, SF: null },
		})
		const data = await loadBallotShareCardData(ballot.slug, user.username)
		expect(data?.standings).toBeNull()
	})
})
