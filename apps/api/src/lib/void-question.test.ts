import { describe, expect, it } from "vitest"
import { db } from "../db"
import { emailOutbox, type Question, userSeasonStats } from "../db/schema"
import {
	makeAdmin,
	makeUser,
	pastDate,
	seedOptionQuestion,
} from "../test/factories"
import { expectData } from "../test/graphql"
import {
	type ResolveOptions,
	resolveQuestionInternal,
	reverseQuestionLeagueStats,
} from "./resolve-question"
import { markQuestionVoided } from "./void-question"

/**
 * A locked question with its callers' season rows already holding the
 * callCount castCall would have given them.
 */
async function seedCalledQuestion(optionIndexes: number[]) {
	const seeded = await seedOptionQuestion({
		callers: optionIndexes.map((optionIndex) => ({ optionIndex })),
		question: { status: "locked", locksAt: pastDate(1) },
	})
	for (const caller of seeded.callers) {
		await db.insert(userSeasonStats).values({
			userId: caller.user.id,
			leagueId: seeded.question.leagueId,
			seasonId: seeded.question.seasonId,
			callCount: 1,
		})
	}
	return seeded
}

const voidIt = (question: Question) =>
	db.transaction((tx) =>
		markQuestionVoided(tx, question, {
			reason: "subject_did_not_play",
			note: "",
			voidedBy: { method: "system" },
		}),
	)

const resolveIt = (
	question: Question,
	correctOptionIds: string[],
	opts: Partial<ResolveOptions> = {},
) =>
	db.transaction((tx) =>
		resolveQuestionInternal(
			tx,
			question,
			{ correctOptionIds, resolutionNote: "" },
			{ resolvedBy: { method: "system" }, ...opts },
		),
	)

const statsFor = (userId: string) =>
	db.query.userSeasonStats.findFirst({ where: { userId } })

describe("markQuestionVoided", () => {
	it("settles a locked question as voided and takes its calls out of call counts", async () => {
		const { question, callers } = await seedCalledQuestion([0])
		const voided = await voidIt(question)

		expect(voided.status).toBe("voided")
		expect(voided.voidedReason).toBe("subject_did_not_play")
		expect(voided.resolutionMethod).toBe("system")
		expect((await statsFor(callers[0].user.id))?.callCount).toBe(0)
		const call = await db.query.calls.findFirst({
			where: { id: callers[0].call.id },
		})
		expect(call?.unscoredReason).toBe("question_voided")
	})

	it("claws back everything a resolved question had scored", async () => {
		const { question, options, callers } = await seedCalledQuestion([0, 1])
		const resolved = await resolveIt(question, [options[0].id])
		await voidIt(resolved)

		for (const caller of callers) {
			const stats = await statsFor(caller.user.id)
			expect(stats?.points).toBe(0)
			expect(stats?.resolvedCallCount).toBe(0)
			expect(stats?.correctCount).toBe(0)
			expect(stats?.callCount).toBe(0)
		}
		const rows = await db.query.questionOptions.findMany({
			where: { questionId: question.id },
		})
		expect(rows.every((o) => o.isCorrect === null)).toBe(true)
	})

	it("doesn't take callCount out twice when a voided question is deleted", async () => {
		const { question, callers } = await seedCalledQuestion([0])
		const voided = await voidIt(question)
		await db.transaction((tx) => reverseQuestionLeagueStats(tx, voided))
		expect((await statsFor(callers[0].user.id))?.callCount).toBe(0)
	})

	it("restores the calls when a voided question resolves after all", async () => {
		const { question, options, callers } = await seedCalledQuestion([0])
		const voided = await voidIt(question)
		const resolved = await resolveIt(voided, [options[0].id])

		expect(resolved.status).toBe("resolved")
		expect(resolved.voidedReason).toBeNull()
		const stats = await statsFor(callers[0].user.id)
		expect(stats?.callCount).toBe(1)
		expect(stats?.resolvedCallCount).toBe(1)
		const call = await db.query.calls.findFirst({
			where: { id: callers[0].call.id },
		})
		expect(call?.unscoredReason).toBeNull()
	})

	it("notifies every caller and queues no email", async () => {
		const { question } = await seedCalledQuestion([0, 1])
		await voidIt(question)

		const rows = await db.query.notifications.findMany({
			where: { questionId: question.id },
		})
		expect(rows).toHaveLength(2)
		expect(rows.every((r) => r.type === "call_voided")).toBe(true)
		expect(await db.select().from(emailOutbox)).toHaveLength(0)
	})

	it("keeps a sole-caller exclusion through a void and a later resolve", async () => {
		const { question, options, callers } = await seedCalledQuestion([0])
		const userId = callers[0].user.id
		const resolved = await resolveIt(question, [options[0].id], {
			unscoredUserIds: new Map([[userId, "creator_sole_caller"]]),
		})
		const voided = await voidIt(resolved)
		await resolveIt(voided, [options[0].id])

		const call = await db.query.calls.findFirst({
			where: { id: callers[0].call.id },
		})
		expect(call?.unscoredReason).toBe("creator_sole_caller")
		expect((await statsFor(userId))?.resolvedCallCount).toBe(0)
	})
})

const MARK_VOIDED = /* GraphQL */ `
	mutation MarkVoided($input: AdminMarkQuestionVoidedInput!) {
		adminMarkQuestionVoided(input: $input) {
			__typename
			... on QuestionPayload { question { id status voidedReason } }
			... on ValidationError { message }
		}
	}
`

const MY_RESOLVED_CALLS = /* GraphQL */ `
	{ myCalls(first: 10, status: RESOLVED) { items { id unscoredReason } } }
`

describe("Mutation.adminMarkQuestionVoided", () => {
	it("refuses a question that hasn't locked", async () => {
		const { question } = await seedOptionQuestion({ callers: [] })
		const admin = await makeAdmin()
		const data = await expectData<{
			adminMarkQuestionVoided: { __typename: string }
		}>(MARK_VOIDED, {
			as: admin,
			variables: { input: { questionId: question.id, reason: "OTHER" } },
		})
		expect(data.adminMarkQuestionVoided.__typename).toBe("ValidationError")
	})

	it("refuses a signed-in non-admin", async () => {
		const { question } = await seedCalledQuestion([0])
		const user = await makeUser()
		const data = await expectData<{
			adminMarkQuestionVoided: { __typename: string }
		}>(MARK_VOIDED, {
			as: user,
			variables: { input: { questionId: question.id, reason: "OTHER" } },
		})
		expect(data.adminMarkQuestionVoided.__typename).toBe("AuthorizationError")
	})

	it("voids a locked question and files its calls under Resolved", async () => {
		const { question, callers } = await seedCalledQuestion([0])
		const admin = await makeAdmin()
		const data = await expectData<{
			adminMarkQuestionVoided: {
				question: { status: string; voidedReason: string }
			}
		}>(MARK_VOIDED, {
			as: admin,
			variables: {
				input: { questionId: question.id, reason: "GAME_NOT_COMPLETED" },
			},
		})
		expect(data.adminMarkQuestionVoided.question.status).toBe("VOIDED")
		expect(data.adminMarkQuestionVoided.question.voidedReason).toBe(
			"GAME_NOT_COMPLETED",
		)

		const mine = await expectData<{
			myCalls: { items: { id: string; unscoredReason: string }[] }
		}>(MY_RESOLVED_CALLS, { as: callers[0].user })
		expect(mine.myCalls.items).toEqual([
			{ id: callers[0].call.id, unscoredReason: "QUESTION_VOIDED" },
		])
	})
})
