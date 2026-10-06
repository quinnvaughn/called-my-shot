import { describe, expect, it } from "vitest"
import { db } from "../../../db"
import { ballotQuestions, ballots } from "../../../db/schema"
import {
	futureDate,
	makeCall,
	makeLeague,
	makeQuestion,
	makeSeason,
	makeStat,
	makeUser,
	pastDate,
} from "../../../test/factories"
import { type ErrorResult, expectData } from "../../../test/graphql"

const REBALANCE = /* GraphQL */ `
	mutation Rebalance($ballotId: ID!, $changes: [RebalanceChangeInput!]!) {
		rebalanceWinTotals(ballotId: $ballotId, changes: $changes) {
			__typename
			... on MutationRebalanceWinTotalsSuccess { data }
			... on ValidationError { message }
			... on AuthenticationError { message }
		}
	}
`

const CALL = /* GraphQL */ `
	query Call($id: ID!) {
		call(id: $id) { guessValue rebalancedFrom }
	}
`

type RebalanceData = {
	rebalanceWinTotals: ErrorResult & { data?: boolean }
}

// A published NFL win-totals ballot of two teams: a 17-game season, so the
// schedule hands out exactly 17 wins between them.
async function seedBallot({
	locked = false,
	statName = "Wins",
}: { locked?: boolean; statName?: string } = {}) {
	const league = await makeLeague({ slug: "nfl" })
	const season = await makeSeason({ leagueId: league.id })
	const stat = await makeStat({ sportId: league.sportId, name: statName })
	const [ballot] = await db
		.insert(ballots)
		.values({
			name: "Win Totals",
			slug: `win-totals-${league.slug}`,
			sportId: league.sportId,
			leagueId: league.id,
			seasonId: season.id,
			status: "published",
			publishedAt: new Date(),
		})
		.returning()
	if (!ballot) throw new Error("ballot insert returned no row")

	const questions = []
	for (let index = 0; index < 2; index++) {
		const question = await makeQuestion({
			leagueId: league.id,
			seasonId: season.id,
			shape: "team_season_stat_numeric_guess",
			statId: stat.id,
			status: locked ? "locked" : "open",
			locksAt: locked ? pastDate(24) : futureDate(24),
		})
		await db.insert(ballotQuestions).values({
			ballotId: ballot.id,
			questionId: question.id,
			label: `Team ${index}`,
			sortOrder: index,
		})
		questions.push(question)
	}
	return { ballot, questions }
}

async function rebalance(
	user: Awaited<ReturnType<typeof makeUser>> | null,
	ballotId: string,
	changes: { questionId: string; guessValue: number }[],
) {
	const data = await expectData<RebalanceData>(REBALANCE, {
		variables: { ballotId, changes },
		as: user,
	})
	return data.rebalanceWinTotals
}

describe("rebalanceWinTotals", () => {
	it("lowers an over ballot's picks and keeps where they started", async () => {
		const { ballot, questions } = await seedBallot()
		const user = await makeUser()
		const first = await makeCall(questions[0].id, user.id, {
			guessValue: 10,
			createdAt: pastDate(48),
		})
		await makeCall(questions[1].id, user.id, { guessValue: 10 })

		const result = await rebalance(user, ballot.id, [
			{ questionId: questions[0].id, guessValue: 8 },
		])
		expect(result.data).toBe(true)

		const row = await db.query.calls.findFirst({ where: { id: first.id } })
		expect(row?.guessValue).toBe(8)
		// A correction to the count, not a new call: the original time stands.
		expect(row?.createdAt).toEqual(first.createdAt)

		const data = await expectData<{
			call: { guessValue: number; rebalancedFrom: number | null }
		}>(CALL, { variables: { id: first.id }, as: user })
		expect(data.call).toEqual({ guessValue: 8, rebalancedFrom: 10 })
	})

	it("refuses raising a pick on an over ballot", async () => {
		const { ballot, questions } = await seedBallot()
		const user = await makeUser()
		await makeCall(questions[0].id, user.id, { guessValue: 10 })
		await makeCall(questions[1].id, user.id, { guessValue: 10 })

		const result = await rebalance(user, ballot.id, [
			{ questionId: questions[0].id, guessValue: 11 },
		])
		expect(result.__typename).toBe("ValidationError")
	})

	it("refuses taking back more than the ballot is over", async () => {
		const { ballot, questions } = await seedBallot()
		const user = await makeUser()
		await makeCall(questions[0].id, user.id, { guessValue: 10 })
		await makeCall(questions[1].id, user.id, { guessValue: 10 })

		const result = await rebalance(user, ballot.id, [
			{ questionId: questions[0].id, guessValue: 6 },
		])
		expect(result.__typename).toBe("ValidationError")
	})

	it("needs every team picked", async () => {
		const { ballot, questions } = await seedBallot()
		const user = await makeUser()
		await makeCall(questions[0].id, user.id, { guessValue: 20 })

		const result = await rebalance(user, ballot.id, [
			{ questionId: questions[0].id, guessValue: 17 },
		])
		expect(result.__typename).toBe("ValidationError")
	})

	it("refuses once the picks have locked", async () => {
		const { ballot, questions } = await seedBallot({ locked: true })
		const user = await makeUser()
		await makeCall(questions[0].id, user.id, { guessValue: 10 })
		await makeCall(questions[1].id, user.id, { guessValue: 10 })

		const result = await rebalance(user, ballot.id, [
			{ questionId: questions[0].id, guessValue: 8 },
		])
		expect(result.__typename).toBe("ValidationError")
	})

	it("only applies to a win-totals ballot", async () => {
		const { ballot, questions } = await seedBallot({ statName: "Points" })
		const user = await makeUser()
		await makeCall(questions[0].id, user.id, { guessValue: 10 })
		await makeCall(questions[1].id, user.id, { guessValue: 10 })

		const result = await rebalance(user, ballot.id, [
			{ questionId: questions[0].id, guessValue: 8 },
		])
		expect(result.__typename).toBe("ValidationError")
	})
})
