import { describe, expect, it } from "vitest"
import {
	makeCall,
	makeGame,
	makeQuestion,
	makeSeason,
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
