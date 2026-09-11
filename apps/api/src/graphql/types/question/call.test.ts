import { describe, expect, it } from "vitest"
import { makeUser, seedOptionQuestion } from "../../../test/factories"
import { execute, expectData } from "../../../test/graphql"

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
