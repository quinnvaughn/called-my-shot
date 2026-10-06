import { describe, expect, it } from "vitest"
import { db } from "../../../db"
import { ballotQuestions, ballots } from "../../../db/schema"
import {
	futureDate,
	makeCall,
	makeLeague,
	makeQuestion,
	makeSeason,
	makeUser,
	pastDate,
} from "../../../test/factories"
import { type ErrorResult, expectData } from "../../../test/graphql"

const SET_ORDER = /* GraphQL */ `
	mutation SetOrder($ballotId: ID!, $questionIds: [ID!]!) {
		setBallotTiebreakOrder(ballotId: $ballotId, questionIds: $questionIds) {
			__typename
			... on MutationSetBallotTiebreakOrderSuccess { data }
			... on ValidationError { message }
			... on AuthenticationError { message }
		}
	}
`

const READ = /* GraphQL */ `
	query Read($ref: ID!, $username: String!) {
		ballot(id: $ref) {
			members { question { id } viewerTiebreakPosition }
			entry(username: $username) {
				members { member { question { id } } tiebreakPosition }
			}
		}
	}
`

type ReadData = {
	ballot: {
		members: { question: { id: string }; viewerTiebreakPosition: number | null }[]
		entry: {
			members: {
				member: { question: { id: string } }
				tiebreakPosition: number | null
			}[]
		} | null
	}
}

type SetOrderData = {
	setBallotTiebreakOrder: ErrorResult & { data?: boolean }
}

// A published win-totals ballot of `count` teams' questions, open unless
// `locked`.
async function seedBallot(count: number, { locked = false } = {}) {
	const league = await makeLeague()
	const season = await makeSeason({ leagueId: league.id })
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
	for (let index = 0; index < count; index++) {
		const question = await makeQuestion({
			leagueId: league.id,
			seasonId: season.id,
			shape: "team_season_stat_numeric_guess",
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

async function setOrder(
	user: Awaited<ReturnType<typeof makeUser>> | null,
	ballotId: string,
	questionIds: string[],
) {
	const data = await expectData<SetOrderData>(SET_ORDER, {
		variables: { ballotId, questionIds },
		as: user,
	})
	return data.setBallotTiebreakOrder
}

describe("setBallotTiebreakOrder", () => {
	it("stores the order and reads it back for the viewer and on the entry", async () => {
		const { ballot, questions } = await seedBallot(3)
		const user = await makeUser()
		for (const q of questions) await makeCall(q.id, user.id, { guessValue: 45 })

		const ids = [questions[2].id, questions[0].id, questions[1].id]
		expect((await setOrder(user, ballot.id, ids)).data).toBe(true)

		const data = await expectData<ReadData>(READ, {
			variables: { ref: ballot.slug, username: user.username },
			as: user,
		})
		const viewer = new Map(
			data.ballot.members.map((m) => [m.question.id, m.viewerTiebreakPosition]),
		)
		expect(ids.map((id) => viewer.get(id))).toEqual([0, 1, 2])
		const entry = new Map(
			data.ballot.entry?.members.map((m) => [
				m.member.question.id,
				m.tiebreakPosition,
			]),
		)
		expect(ids.map((id) => entry.get(id))).toEqual([0, 1, 2])
	})

	it("rewrites positions when the same tie is reordered", async () => {
		const { ballot, questions } = await seedBallot(2)
		const user = await makeUser()
		for (const q of questions) await makeCall(q.id, user.id, { guessValue: 9 })

		await setOrder(user, ballot.id, [questions[0].id, questions[1].id])
		await setOrder(user, ballot.id, [questions[1].id, questions[0].id])

		const data = await expectData<ReadData>(READ, {
			variables: { ref: ballot.slug, username: user.username },
			as: user,
		})
		expect(
			data.ballot.members.map((m) => m.viewerTiebreakPosition),
		).toEqual([1, 0])
	})

	it("rejects teams that weren't given the same win total", async () => {
		const { ballot, questions } = await seedBallot(2)
		const user = await makeUser()
		await makeCall(questions[0].id, user.id, { guessValue: 45 })
		await makeCall(questions[1].id, user.id, { guessValue: 46 })

		const result = await setOrder(user, ballot.id, questions.map((q) => q.id))
		expect(result.__typename).toBe("ValidationError")
	})

	it("rejects a team the user hasn't picked", async () => {
		const { ballot, questions } = await seedBallot(2)
		const user = await makeUser()
		await makeCall(questions[0].id, user.id, { guessValue: 45 })

		const result = await setOrder(user, ballot.id, questions.map((q) => q.id))
		expect(result.__typename).toBe("ValidationError")
	})

	it("rejects once the picks have locked", async () => {
		const { ballot, questions } = await seedBallot(2, { locked: true })
		const user = await makeUser()
		for (const q of questions) await makeCall(q.id, user.id, { guessValue: 45 })

		const result = await setOrder(user, ballot.id, questions.map((q) => q.id))
		expect(result.__typename).toBe("ValidationError")
	})

	it("rejects a question that isn't on the ballot", async () => {
		const { ballot, questions } = await seedBallot(1)
		const stray = await makeQuestion({ shape: "team_season_stat_numeric_guess" })
		const user = await makeUser()
		await makeCall(questions[0].id, user.id, { guessValue: 45 })
		await makeCall(stray.id, user.id, { guessValue: 45 })

		const result = await setOrder(user, ballot.id, [questions[0].id, stray.id])
		expect(result.__typename).toBe("ValidationError")
	})

	it("only ever reads the viewer's own order", async () => {
		const { ballot, questions } = await seedBallot(2)
		const owner = await makeUser()
		for (const q of questions) await makeCall(q.id, owner.id, { guessValue: 45 })
		await setOrder(owner, ballot.id, [questions[1].id, questions[0].id])

		const other = await makeUser()
		const data = await expectData<ReadData>(READ, {
			variables: { ref: ballot.slug, username: owner.username },
			as: other,
		})
		expect(
			data.ballot.members.map((m) => m.viewerTiebreakPosition),
		).toEqual([null, null])
		expect(
			data.ballot.entry?.members.map((m) => m.tiebreakPosition),
		).toEqual([1, 0])
	})

	it("needs a signed-in user", async () => {
		const { ballot, questions } = await seedBallot(2)
		const result = await setOrder(null, ballot.id, questions.map((q) => q.id))
		expect(result.__typename).toBe("AuthenticationError")
	})
})
