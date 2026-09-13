import { describe, expect, it } from "vitest"
import { db } from "../db"
import type { User } from "../db/schema"
import {
	makeCall,
	makeOption,
	makeQuestion,
	makeSelection,
	makeUser,
	pastDate,
} from "../test/factories"
import { expectData } from "../test/graphql"
import { type ResolvedBy, resolveQuestionInternal } from "./resolve-question"
import {
	loadFrequentCoCallers,
	loadSelfGradingReport,
} from "./self-grading-report"

/**
 * A yes/no question by `creator`, called by each of `callers` on the option
 * at their index, then resolved to `correctIndex`. Resolved by the creator
 * unless `resolvedBy` says otherwise.
 */
async function gradedQuestion(opts: {
	creator: User
	callers: { user: User; optionIndex: number }[]
	correctIndex: number
	resolvedBy?: ResolvedBy
	soleCaller?: boolean
}) {
	const question = await makeQuestion({
		creatorId: opts.creator.id,
		status: "locked",
		locksAt: pastDate(1),
	})
	const options = [
		await makeOption(question.id, { label: "Yes", sortOrder: 0 }),
		await makeOption(question.id, { label: "No", sortOrder: 1 }),
	]
	for (const caller of opts.callers) {
		const call = await makeCall(question.id, caller.user.id)
		await makeSelection(call.id, options[caller.optionIndex].id)
	}
	await db.transaction((tx) =>
		resolveQuestionInternal(
			tx,
			question,
			{ correctOptionIds: [options[opts.correctIndex].id], resolutionNote: "" },
			{
				resolvedBy: opts.resolvedBy ?? {
					method: "creator",
					userId: opts.creator.id,
				},
				...(opts.soleCaller
					? {
							unscoredUserIds: new Map([
								[opts.creator.id, "creator_sole_caller" as const],
							]),
						}
					: {}),
			},
		),
	)
	return question
}

describe("loadSelfGradingReport", () => {
	it("credits a creator's own winning call on a question they graded", async () => {
		const creator = await makeUser()
		const other = await makeUser()
		await gradedQuestion({
			creator,
			callers: [
				{ user: creator, optionIndex: 0 },
				{ user: other, optionIndex: 1 },
			],
			correctIndex: 0,
		})

		const [row] = await loadSelfGradingReport()
		expect(row.userId).toBe(creator.id)
		expect(row.handGradedCount).toBe(1)
		expect(row.ownCallCount).toBe(1)
		expect(row.ownCallWins).toBe(1)
		expect(row.ownCallLosses).toBe(0)
		expect(row.ownCallPoints).toBeGreaterThan(0)
	})

	it("ignores questions someone else resolved", async () => {
		const creator = await makeUser()
		await gradedQuestion({
			creator,
			callers: [{ user: creator, optionIndex: 0 }],
			correctIndex: 0,
			resolvedBy: { method: "system" },
		})
		expect(await loadSelfGradingReport()).toEqual([])
	})

	it("counts a sole-caller question as graded but its unscored call as nothing", async () => {
		const creator = await makeUser()
		await gradedQuestion({
			creator,
			callers: [{ user: creator, optionIndex: 0 }],
			correctIndex: 0,
			soleCaller: true,
		})

		const [row] = await loadSelfGradingReport()
		expect(row.handGradedCount).toBe(1)
		expect(row.ownCallCount).toBe(0)
		expect(row.ownCallPoints).toBe(0)
	})
})

describe("loadFrequentCoCallers", () => {
	it("surfaces a user who keeps calling one creator's graded questions", async () => {
		const creator = await makeUser()
		const alt = await makeUser()
		for (let i = 0; i < 2; i++) {
			await gradedQuestion({
				creator,
				callers: [
					{ user: creator, optionIndex: 0 },
					{ user: alt, optionIndex: 1 },
				],
				correctIndex: 0,
			})
		}

		const rows = await loadFrequentCoCallers(creator.id, 2)
		expect(rows).toHaveLength(1)
		expect(rows[0].userId).toBe(alt.id)
		expect(rows[0].sharedCount).toBe(2)
		expect(rows[0].losses).toBe(2)
		expect(rows[0].shareOfTheirCalls).toBe(1)
	})

	it("leaves out anyone below the shared-question threshold", async () => {
		const creator = await makeUser()
		const other = await makeUser()
		await gradedQuestion({
			creator,
			callers: [{ user: other, optionIndex: 0 }],
			correctIndex: 0,
		})
		expect(await loadFrequentCoCallers(creator.id, 2)).toEqual([])
	})
})

describe("Query.adminSelfGradingReport", () => {
	it("refuses a signed-in non-admin", async () => {
		const user = await makeUser()
		const data = await expectData<{
			adminSelfGradingReport: { __typename: string }
		}>(`{ adminSelfGradingReport { __typename } }`, { as: user })
		expect(data.adminSelfGradingReport.__typename).toBe("AuthorizationError")
	})
})
