import { describe, expect, it } from "vitest"
import type { User } from "../../../db/schema"
import {
	makeCall,
	makeGroup,
	makeOption,
	makeQuestion,
	makeSelection,
	makeUser,
} from "../../../test/factories"
import { expectData } from "../../../test/graphql"
import { hoursAgo } from "../../../test/helpers"

const QUERY = `
	query ($id: ID!) {
		question(id: $id) {
			viewerGroupPicks { optionId count sampleUser { username } }
		}
	}
`

type Result = {
	question: {
		viewerGroupPicks: {
			optionId: string
			count: number
			sampleUser: { username: string }
		}[]
	}
}

async function overUnder() {
	const question = await makeQuestion({ shape: "player_stat_over_under" })
	const over = await makeOption(question.id, { label: "Over", sortOrder: 0 })
	const under = await makeOption(question.id, { label: "Under", sortOrder: 1 })
	return { question, over, under }
}

async function pick(
	questionId: string,
	optionId: string,
	user: { id: string },
	hoursBack = 1,
) {
	const call = await makeCall(questionId, user.id, {
		createdAt: hoursAgo(hoursBack),
	})
	await makeSelection(call.id, optionId)
}

const picksFor = async (questionId: string, as: User | null) =>
	(await expectData<Result>(QUERY, { variables: { id: questionId }, as }))
		.question.viewerGroupPicks

describe("Question.viewerGroupPicks", () => {
	it("tallies only the people the viewer shares a group with", async () => {
		const viewer = await makeUser()
		const mate = await makeUser({ username: "sam" })
		const stranger = await makeUser()
		await makeGroup({ admin: viewer, members: [mate] })
		const { question, over } = await overUnder()
		await pick(question.id, over.id, mate)
		await pick(question.id, over.id, stranger)

		expect(await picksFor(question.id, viewer)).toEqual([
			{ optionId: over.id, count: 1, sampleUser: { username: "sam" } },
		])
	})

	it("leaves the viewer's own call out", async () => {
		const viewer = await makeUser()
		const mate = await makeUser()
		await makeGroup({ admin: viewer, members: [mate] })
		const { question, over } = await overUnder()
		await pick(question.id, over.id, viewer)

		expect(await picksFor(question.id, viewer)).toEqual([])
	})

	it("counts someone in two of the viewer's groups once", async () => {
		const viewer = await makeUser()
		const mate = await makeUser()
		await makeGroup({ admin: viewer, members: [mate] })
		await makeGroup({ admin: mate, members: [viewer] })
		const { question, under } = await overUnder()
		await pick(question.id, under.id, mate)

		expect((await picksFor(question.id, viewer))[0]?.count).toBe(1)
	})

	it("names whoever picked the side most recently", async () => {
		const viewer = await makeUser()
		const early = await makeUser({ username: "early" })
		const late = await makeUser({ username: "late" })
		await makeGroup({ admin: viewer, members: [early, late] })
		const { question, over } = await overUnder()
		await pick(question.id, over.id, early, 5)
		await pick(question.id, over.id, late, 1)

		expect(await picksFor(question.id, viewer)).toEqual([
			{ optionId: over.id, count: 2, sampleUser: { username: "late" } },
		])
	})

	it("is empty signed out", async () => {
		const mate = await makeUser()
		const { question, over } = await overUnder()
		await pick(question.id, over.id, mate)

		expect(await picksFor(question.id, null)).toEqual([])
	})
})
