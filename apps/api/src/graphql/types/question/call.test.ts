import {
	basePointsFor,
	earlyTierFor,
	pointsAtStake,
	previewSelectionPoints,
	SEASON_PLAY_FLOOR,
} from "@called-my-shot/scoring"
import { describe, expect, it } from "vitest"
import {
	makeCall,
	makeGame,
	makeOption,
	makeQuestion,
	makeSeason,
	makeSelection,
	makeUser,
	seedOptionQuestion,
} from "../../../test/factories"
import { execute, expectData } from "../../../test/graphql"
import { hoursAgo, hoursFromNow } from "../../../test/helpers"

const QUESTION_CALLS = /* GraphQL */ `
	query QuestionCalls($id: ID!) {
		question(id: $id) {
			calls(first: 10) {
				items { id selections { id option { label } } }
			}
		}
	}
`

const CALL = /* GraphQL */ `
	query Call($id: ID!) {
		call(id: $id) {
			id
			createdAt
			selections { id option { label } }
		}
	}
`

type CallRow = {
	id: string
	selections: { id: string; option: { label: string } }[]
}

describe("Call pick fields", () => {
	it("show every pick on an open question to someone signed out", async () => {
		const { question } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }, { optionIndex: 1 }],
		})

		const data = await expectData<{
			question: { calls: { items: CallRow[] } }
		}>(QUESTION_CALLS, { variables: { id: question.id } })

		const labels = data.question.calls.items.flatMap((c) =>
			c.selections.map((s) => s.option.label),
		)
		expect(labels.sort()).toEqual(["No", "Yes"])
	})

	it("show every pick on an open question to a viewer who hasn't called it", async () => {
		const { question } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }, { optionIndex: 1 }],
		})
		const bystander = await makeUser()

		const data = await expectData<{
			question: { calls: { items: CallRow[] } }
		}>(QUESTION_CALLS, { variables: { id: question.id }, as: bystander })

		for (const call of data.question.calls.items) {
			expect(call.selections).toHaveLength(1)
		}
	})
})

describe("Query.call", () => {
	it("returns null for a malformed id rather than erroring", async () => {
		// A uuid column throws on malformed input rather than not matching, so
		// this has to be caught before the lookup - same guard Query.question
		// applies.
		const result = await execute(CALL, { variables: { id: "not-a-uuid" } })
		expect(result.errors).toBeUndefined()
		expect(result.data?.call).toBeNull()
	})

	it("returns null for an id that doesn't exist", async () => {
		const data = await expectData<{ call: unknown }>(CALL, {
			variables: { id: "00000000-0000-4000-8000-000000000000" },
		})
		expect(data.call).toBeNull()
	})

	it("renders the full call for someone signed out", async () => {
		const { callers } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})

		const data = await expectData<{
			call: { createdAt: string; selections: CallRow["selections"] }
		}>(CALL, { variables: { id: callers[0].call.id } })

		expect(data.call.selections[0].option.label).toBe("Yes")
		expect(Date.parse(data.call.createdAt)).not.toBeNaN()
	})
})

describe("season window counts", () => {
	const SEASON_WINDOW = /* GraphQL */ `
		query SeasonWindow($id: ID!) {
			question(id: $id) {
				seasonGamesPlayed
				seasonTotalGames
				calls(first: 10) {
					items { seasonGamesPlayed seasonTotalGames }
				}
			}
		}
	`

	it("bound a season-long question's games by its lock, and a call's played games by when it was made", async () => {
		const season = await makeSeason()
		const { leagueId } = season
		const inSeason = (startsAt: Date, status: "final" | "scheduled") =>
			makeGame({ leagueId, seasonId: season.id, startsAt, status })
		await inSeason(hoursAgo(72), "final")
		await inSeason(hoursAgo(24), "final")
		await inSeason(hoursFromNow(24), "scheduled")
		// Past the question's lock, so outside its window entirely.
		await inSeason(hoursFromNow(96), "scheduled")
		// Another season's game never counts.
		await makeGame({ leagueId, startsAt: hoursAgo(48), status: "final" })

		const question = await makeQuestion({
			shape: "player_season_award",
			awardName: "MVP",
			awardVerb: "win",
			picksRequired: 1,
			leagueId,
			seasonId: season.id,
			locksAt: hoursFromNow(48),
		})
		const user = await makeUser()
		await makeCall(question.id, user.id, { createdAt: hoursAgo(48) })

		const data = await expectData<{
			question: {
				seasonGamesPlayed: number
				seasonTotalGames: number
				calls: {
					items: { seasonGamesPlayed: number; seasonTotalGames: number }[]
				}
			}
		}>(SEASON_WINDOW, { variables: { id: question.id } })

		expect(data.question.seasonGamesPlayed).toBe(2)
		expect(data.question.seasonTotalGames).toBe(3)
		expect(data.question.calls.items).toEqual([
			{ seasonGamesPlayed: 1, seasonTotalGames: 3 },
		])
	})

	it("are null on a game-scoped question", async () => {
		const { question } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})
		const data = await expectData<{
			question: {
				seasonGamesPlayed: number | null
				calls: { items: { seasonTotalGames: number | null }[] }
			}
		}>(SEASON_WINDOW, { variables: { id: question.id } })
		expect(data.question.seasonGamesPlayed).toBeNull()
		expect(data.question.calls.items[0]?.seasonTotalGames).toBeNull()
	})
})

describe("season play", () => {
	const SEASON_PLAY = /* GraphQL */ `
		query SeasonPlay($id: ID!) {
			question(id: $id) {
				viewerSeasonPlay { weeksPlayed weeksCounted weight settled }
				calls(first: 10) {
					items {
						seasonPlay { weeksPlayed weeksCounted weight settled }
						payout { lose }
					}
				}
			}
		}
	`

	it("sizes a pending season call at its caller's pace so far", async () => {
		const season = await makeSeason()
		for (const daysAgo of [21, 14]) {
			const game = await makeGame({
				leagueId: season.leagueId,
				seasonId: season.id,
				startsAt: hoursAgo(24 * daysAgo),
				status: "final",
			})
			await makeQuestion({
				leagueId: season.leagueId,
				seasonId: season.id,
				gameId: game.id,
				locksAt: game.startsAt,
			})
		}
		const question = await makeQuestion({
			shape: "team_vs_team_season",
			isOfficial: true,
			leagueId: season.leagueId,
			seasonId: season.id,
			locksAt: hoursFromNow(48),
		})
		const option = await makeOption(question.id, { label: "A" })
		await makeOption(question.id, { label: "B" })
		const user = await makeUser()
		const call = await makeCall(question.id, user.id)
		await makeSelection(call.id, option.id, 100)

		const data = await expectData<{
			question: {
				viewerSeasonPlay: Record<string, unknown> | null
				calls: {
					items: {
						seasonPlay: Record<string, unknown> | null
						payout: { lose: number } | null
					}[]
				}
			}
		}>(SEASON_PLAY, { as: user, variables: { id: question.id } })

		// Two finished weeks of game questions, neither played: the floor.
		const pace = {
			weeksPlayed: 0,
			weeksCounted: 2,
			weight: SEASON_PLAY_FLOOR,
			settled: false,
		}
		expect(data.question.viewerSeasonPlay).toEqual(pace)
		const [row] = data.question.calls.items
		expect(row?.seasonPlay).toEqual(pace)
		const base = basePointsFor({ ...question, isPriced: false })
		expect(row?.payout?.lose).toBe(
			pointsAtStake(base * SEASON_PLAY_FLOOR, question.lossRate, 100),
		)
	})
})

describe("Call.currentRank and Call.payout", () => {
	const RANK_AND_PAYOUT = /* GraphQL */ `
		query RankAndPayout($id: ID!) {
			question(id: $id) {
				calls(first: 10) {
					items { id currentRank payout { winLow winHigh lose } }
				}
			}
		}
	`
	type Row = {
		id: string
		currentRank: number
		payout: { winLow: number; winHigh: number; lose: number } | null
	}

	it("ranks each call by when it was made and prices it off the field's conviction as it stands", async () => {
		const { question, callers } = await seedOptionQuestion({
			callers: [
				{ optionIndex: 0, conviction: 80, createdAt: hoursAgo(3) },
				{ optionIndex: 1, conviction: 50, createdAt: hoursAgo(2) },
				{ optionIndex: 0, conviction: 100, createdAt: hoursAgo(1) },
			],
		})

		const data = await expectData<{
			question: { calls: { items: Row[] } }
		}>(RANK_AND_PAYOUT, { variables: { id: question.id } })
		const byId = new Map(data.question.calls.items.map((c) => [c.id, c]))

		const basePoints = basePointsFor({ ...question, isPriced: false })
		// 180 of the field's 230 conviction is on the first option.
		const expectations = [
			{ rank: 1, fieldPct: (180 / 230) * 100, conviction: 80 },
			{ rank: 2, fieldPct: (50 / 230) * 100, conviction: 50 },
			{ rank: 3, fieldPct: (180 / 230) * 100, conviction: 100 },
		]
		for (const [index, expected] of expectations.entries()) {
			const row = byId.get(callers[index].call.id)
			const preview = previewSelectionPoints(
				basePoints,
				question.lossRate,
				expected.fieldPct,
				2,
				expected.conviction,
				earlyTierFor(expected.rank, 3),
			)
			expect(row?.currentRank).toBe(expected.rank)
			expect(row?.payout).toEqual({
				winLow: preview.win,
				winHigh: preview.win,
				lose: preview.lose,
			})
		}
	})

	it("has no payout once the question settles", async () => {
		const { question } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
			question: { status: "resolved" },
		})

		const data = await expectData<{
			question: { calls: { items: Row[] } }
		}>(RANK_AND_PAYOUT, { variables: { id: question.id } })

		expect(data.question.calls.items[0].payout).toBeNull()
	})
})
