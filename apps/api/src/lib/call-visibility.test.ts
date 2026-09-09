import { describe, expect, it } from "vitest"
import {
	futureDate,
	makeUser,
	pastDate,
	seedOptionQuestion,
} from "../test/factories"
import { execute, expectData } from "../test/graphql"

// Query.call is the call page's only data source, and canViewerSeePick is what
// decides how much of a call it hands over. Both changed at once when the call
// page landed: the gate stopped refusing everyone who is signed out, and
// possession of a call id became its own authorization. These are the tests
// that pin what each of those does and, more importantly, what neither does.

const QUESTION_CALLS = /* GraphQL */ `
	query QuestionCalls($id: ID!) {
		question(id: $id) {
			calls(first: 10) {
				items { id caseText conviction viewerCanSeePick selections { id } }
			}
		}
	}
`

const CALL = /* GraphQL */ `
	query Call($id: ID!) {
		call(id: $id) {
			id
			caseText
			conviction
			viewerCanSeePick
			createdAt
			selections { id option { label } }
		}
	}
`

type CallRow = {
	id: string
	caseText: string | null
	conviction: number | null
	viewerCanSeePick: boolean
	selections: { id: string }[]
}

// Two callers on one question, not one: a dropped `userId` filter in the
// viewer-calls lookup shows up as "every call is visible", which a
// single-caller fixture can't tell apart from a correct answer.
async function seedTwoCallerQuestion(overrides: {
	status?: "open" | "locked" | "resolved"
	locksAt?: Date
}) {
	return seedOptionQuestion({
		question: {
			status: overrides.status ?? "open",
			locksAt: overrides.locksAt ?? futureDate(24),
		},
		callers: [{ optionIndex: 0 }, { optionIndex: 1 }],
	})
}

describe("canViewerSeePick, signed out", () => {
	it("shows picks on a resolved question", async () => {
		const { question } = await seedTwoCallerQuestion({
			status: "resolved",
			locksAt: pastDate(24),
		})

		const data = await expectData<{
			question: { calls: { items: CallRow[] } }
		}>(QUESTION_CALLS, { variables: { id: question.id } })

		const items = data.question.calls.items
		expect(items).toHaveLength(2)
		for (const call of items) {
			expect(call.viewerCanSeePick).toBe(true)
			expect(call.selections).toHaveLength(1)
		}
	})

	it("shows picks on a question that has locked but not resolved", async () => {
		const { question } = await seedTwoCallerQuestion({
			status: "locked",
			locksAt: pastDate(1),
		})

		const data = await expectData<{
			question: { calls: { items: CallRow[] } }
		}>(QUESTION_CALLS, { variables: { id: question.id } })

		for (const call of data.question.calls.items) {
			expect(call.viewerCanSeePick).toBe(true)
		}
	})

	// The one the whole file is really guarding. Drizzle's relational query
	// builder DROPS an `undefined` filter rather than matching nothing, so a
	// viewer-calls lookup run with `userId: undefined` returns every call on
	// the question and marks all of them viewer-called.
	it("hides every pick on a question still accepting calls", async () => {
		const { question } = await seedTwoCallerQuestion({ status: "open" })

		const data = await expectData<{
			question: { calls: { items: CallRow[] } }
		}>(QUESTION_CALLS, { variables: { id: question.id } })

		const items = data.question.calls.items
		expect(items).toHaveLength(2)
		for (const call of items) {
			expect(call.viewerCanSeePick).toBe(false)
			expect(call.caseText).toBeNull()
			expect(call.conviction).toBeNull()
			expect(call.selections).toEqual([])
		}
	})
})

describe("canViewerSeePick, signed in", () => {
	it("hides other people's picks from a non-caller on an open question", async () => {
		const { question } = await seedTwoCallerQuestion({ status: "open" })
		const bystander = await makeUser()

		const data = await expectData<{
			question: { calls: { items: CallRow[] } }
		}>(QUESTION_CALLS, { variables: { id: question.id }, as: bystander })

		for (const call of data.question.calls.items) {
			expect(call.viewerCanSeePick).toBe(false)
		}
	})

	it("opens every pick to someone who has called on the question", async () => {
		const { question, callers } = await seedTwoCallerQuestion({
			status: "open",
		})

		const data = await expectData<{
			question: { calls: { items: CallRow[] } }
		}>(QUESTION_CALLS, {
			variables: { id: question.id },
			as: callers[0].user,
		})

		for (const call of data.question.calls.items) {
			expect(call.viewerCanSeePick).toBe(true)
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

	// The call page is a public record someone arrives at from a link, usually
	// with no account. Possession of the (unguessable) id is the authorization,
	// so it renders in full even while the question is still taking calls.
	it("shows the full pick to a signed-out viewer on an open question", async () => {
		const { callers } = await seedTwoCallerQuestion({ status: "open" })
		const target = callers[0].call

		const data = await expectData<{
			call: {
				caseText: string | null
				conviction: number | null
				viewerCanSeePick: boolean
				createdAt: string
				selections: { option: { label: string } }[]
			}
		}>(CALL, { variables: { id: target.id } })

		expect(data.call.viewerCanSeePick).toBe(true)
		expect(data.call.selections).toHaveLength(1)
		expect(data.call.selections[0].option.label).toBe("Yes")
		// The date the call was made is the claim the page exists to state, so
		// it is never gated.
		expect(Date.parse(data.call.createdAt)).not.toBeNaN()
	})

	// The bypass is scoped to the exact id asked for. Reaching a sibling call
	// through the question in the same operation must not inherit it, or one
	// shared link would unlock a whole open question's field.
	it("does not leak sibling calls reached through the question", async () => {
		const { question, callers } = await seedTwoCallerQuestion({
			status: "open",
		})
		const target = callers[0].call
		const sibling = callers[1].call

		const data = await expectData<{
			call: { id: string; viewerCanSeePick: boolean }
			question: { calls: { items: CallRow[] } }
		}>(
			/* GraphQL */ `
				query CallAndSiblings($callId: ID!, $questionId: ID!) {
					call(id: $callId) { id viewerCanSeePick }
					question(id: $questionId) {
						calls(first: 10) { items { id viewerCanSeePick caseText } }
					}
				}
			`,
			{ variables: { callId: target.id, questionId: question.id } },
		)

		expect(data.call.viewerCanSeePick).toBe(true)

		const siblingRow = data.question.calls.items.find((c) => c.id === sibling.id)
		expect(siblingRow?.viewerCanSeePick).toBe(false)
		expect(siblingRow?.caseText).toBeNull()

		// The addressed call stays visible everywhere in the same request,
		// including where it shows up in the question's own list.
		const targetRow = data.question.calls.items.find((c) => c.id === target.id)
		expect(targetRow?.viewerCanSeePick).toBe(true)
	})
})
