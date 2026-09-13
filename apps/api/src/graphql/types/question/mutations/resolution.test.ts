import { describe, expect, it } from "vitest"
import { db } from "../../../../db"
import {
	makeAdmin,
	makeCall,
	makeGame,
	makeOption,
	makeQuestion,
	makeSelection,
	makeUser,
	pastDate,
	seedOptionQuestion,
} from "../../../../test/factories"
import { expectData } from "../../../../test/graphql"

type Result<T = unknown> = { __typename: string; message?: string } & T
type QuestionResult = Result<{
	question?: {
		id: string
		status: string
		resolutionMethod: string | null
		resolutionSource?: string
	}
}>

const RESOLVE = /* GraphQL */ `
	mutation Resolve($input: ResolveQuestionInput!) {
		resolveQuestion(input: $input) {
			__typename
			... on QuestionPayload { question { id status resolutionMethod } }
			... on AuthorizationError { message }
			... on ValidationError { message }
		}
	}
`

const ADMIN_RESOLVE = /* GraphQL */ `
	mutation AdminResolve($input: AdminResolveQuestionInput!) {
		adminResolveQuestion(input: $input) {
			__typename
			... on QuestionPayload {
				question { id status resolutionMethod resolutionSource }
			}
			... on ValidationError { message }
		}
	}
`

const OVERTURN = /* GraphQL */ `
	mutation Overturn($input: OverturnDisputeInput!) {
		overturnDispute(input: $input) {
			__typename
			... on QuestionPayload { question { id status resolutionMethod } }
			... on ValidationError { message }
		}
	}
`

const FILE_DISPUTE = /* GraphQL */ `
	mutation FileDispute($input: FileDisputeInput!) {
		fileDispute(input: $input) {
			__typename
			... on FileDisputePayload { dispute { id } }
			... on AuthorizationError { message }
			... on ValidationError { message }
		}
	}
`

const VOID = /* GraphQL */ `
	mutation Void($input: VoidQuestionInput!) {
		voidQuestion(input: $input) {
			__typename
			... on ValidationError { message }
		}
	}
`

const QUEUE = /* GraphQL */ `
	{
		adminQueueSummary {
			__typename
			... on QueryAdminQueueSummarySuccess {
				data { needsResolution { id } probablyStillLive { id } }
			}
		}
	}
`

/** A creator's question that has already locked, with one outside caller. */
async function lockedQuestion() {
	const creator = await makeUser()
	const seeded = await seedOptionQuestion({
		callers: [{ optionIndex: 0 }],
		question: { creatorId: creator.id, locksAt: pastDate(1) },
	})
	return { creator, ...seeded }
}

async function resolveAs(
	user: Awaited<ReturnType<typeof makeUser>>,
	questionId: string,
	correctOptionIds: string[],
) {
	const data = await expectData<{ resolveQuestion: QuestionResult }>(RESOLVE, {
		as: user,
		variables: { input: { questionId, correctOptionIds } },
	})
	return data.resolveQuestion
}

describe("Mutation.resolveQuestion", () => {
	it("refuses anyone but the creator", async () => {
		const { question, options } = await lockedQuestion()
		const stranger = await makeUser()
		const result = await resolveAs(stranger, question.id, [options[0].id])
		expect(result.__typename).toBe("AuthorizationError")
	})

	it("refuses a question that hasn't locked yet", async () => {
		const creator = await makeUser()
		const { question, options } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
			question: { creatorId: creator.id },
		})
		const result = await resolveAs(creator, question.id, [options[0].id])
		expect(result.__typename).toBe("ValidationError")
	})

	it("refuses a question that already resolved", async () => {
		const { creator, question, options } = await lockedQuestion()
		await resolveAs(creator, question.id, [options[0].id])
		const again = await resolveAs(creator, question.id, [options[1].id])
		expect(again.__typename).toBe("ValidationError")
	})

	it("records the creator as the resolver", async () => {
		const { creator, question, options } = await lockedQuestion()
		const result = await resolveAs(creator, question.id, [options[0].id])
		expect(result.question?.status).toBe("RESOLVED")
		expect(result.question?.resolutionMethod).toBe("CREATOR")
	})

	it("leaves the creator's own call unscored when nobody else called", async () => {
		const creator = await makeUser()
		const { question, options } = await seedOptionQuestion({
			callers: [],
			question: { creatorId: creator.id, locksAt: pastDate(1) },
		})
		const call = await makeCall(question.id, creator.id)
		await makeSelection(call.id, options[0].id)

		const result = await resolveAs(creator, question.id, [options[0].id])
		expect(result.question?.status).toBe("RESOLVED")
		const scored = await db.query.calls.findFirst({ where: { id: call.id } })
		expect(scored?.unscoredReason).toBe("creator_sole_caller")
		expect(
			await db.query.userSeasonStats.findFirst({
				where: { userId: creator.id },
			}),
		).toBeUndefined()
	})

	it("scores the creator's own call when someone else called too", async () => {
		const { creator, question, options } = await lockedQuestion()
		const call = await makeCall(question.id, creator.id)
		const selection = await makeSelection(call.id, options[0].id)

		await resolveAs(creator, question.id, [options[0].id])
		const scored = await db.query.callSelections.findFirst({
			where: { id: selection.id },
		})
		expect(scored?.resultPoints).toBeGreaterThan(0)
	})

	it("refuses a question the system resolves", async () => {
		const creator = await makeUser()
		const { question, options } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
			question: {
				creatorId: creator.id,
				locksAt: pastDate(1),
				resolutionMode: "system",
			},
		})
		const result = await resolveAs(creator, question.id, [options[0].id])
		expect(result.__typename).toBe("ValidationError")
	})
})

describe("Mutation.adminResolveQuestion", () => {
	it("records an admin resolution and overwrites the source", async () => {
		const { question, options } = await lockedQuestion()
		const admin = await makeAdmin()
		const data = await expectData<{ adminResolveQuestion: QuestionResult }>(
			ADMIN_RESOLVE,
			{
				as: admin,
				variables: {
					input: {
						questionId: question.id,
						correctOptionIds: [options[0].id],
						resolutionSource: "League release",
					},
				},
			},
		)
		expect(data.adminResolveQuestion.question?.resolutionMethod).toBe("ADMIN")
		expect(data.adminResolveQuestion.question?.resolutionSource).toBe(
			"League release",
		)
	})
})

describe("Mutation.fileDispute", () => {
	it("refuses someone who didn't call the question", async () => {
		const { creator, question, options } = await lockedQuestion()
		await resolveAs(creator, question.id, [options[0].id])
		const stranger = await makeUser()
		const data = await expectData<{ fileDispute: Result }>(FILE_DISPUTE, {
			as: stranger,
			variables: { input: { questionId: question.id, reason: "Wrong" } },
		})
		expect(data.fileDispute.__typename).toBe("AuthorizationError")
	})

	it("refuses a question that hasn't resolved", async () => {
		const { question, callers } = await lockedQuestion()
		const data = await expectData<{ fileDispute: Result }>(FILE_DISPUTE, {
			as: callers[0].user,
			variables: { input: { questionId: question.id, reason: "Wrong" } },
		})
		expect(data.fileDispute.__typename).toBe("ValidationError")
	})

	it("refuses a second dispute from the same caller", async () => {
		const { creator, question, options, callers } = await lockedQuestion()
		await resolveAs(creator, question.id, [options[0].id])
		const input = { questionId: question.id, reason: "Wrong" }
		await expectData(FILE_DISPUTE, {
			as: callers[0].user,
			variables: { input },
		})
		const data = await expectData<{ fileDispute: Result }>(FILE_DISPUTE, {
			as: callers[0].user,
			variables: { input },
		})
		expect(data.fileDispute.__typename).toBe("ValidationError")
	})
})

describe("Mutation.overturnDispute", () => {
	it("re-resolves the question as the admin", async () => {
		const { creator, question, options, callers } = await lockedQuestion()
		await resolveAs(creator, question.id, [options[1].id])
		const filed = await expectData<{
			fileDispute: Result<{ dispute: { id: string } }>
		}>(FILE_DISPUTE, {
			as: callers[0].user,
			variables: { input: { questionId: question.id, reason: "Wrong" } },
		})
		const admin = await makeAdmin()
		const data = await expectData<{ overturnDispute: QuestionResult }>(
			OVERTURN,
			{
				as: admin,
				variables: {
					input: {
						disputeId: filed.fileDispute.dispute.id,
						resolution: {
							questionId: question.id,
							correctOptionIds: [options[0].id],
						},
					},
				},
			},
		)
		expect(data.overturnDispute.question?.status).toBe("RESOLVED")
		expect(data.overturnDispute.question?.resolutionMethod).toBe("ADMIN")
	})
})

describe("Mutation.voidQuestion", () => {
	it("voids a locked question", async () => {
		const question = await makeQuestion({
			status: "locked",
			locksAt: pastDate(1),
		})
		const admin = await makeAdmin()
		const data = await expectData<{ voidQuestion: Result }>(VOID, {
			as: admin,
			variables: {
				input: {
					questionId: question.id,
					reason: "OTHER",
					countsAsStrike: false,
				},
			},
		})
		expect(data.voidQuestion.__typename).toBe("VoidQuestionPayload")
	})
})

describe("Query.adminQueueSummary", () => {
	it("lists a game question the lock job already flipped to locked", async () => {
		const game = await makeGame({ startsAt: pastDate(48) })
		const question = await makeQuestion({
			leagueId: game.leagueId,
			seasonId: game.seasonId,
			gameId: game.id,
			status: "locked",
			locksAt: pastDate(48),
		})
		const user = await makeUser()
		const call = await makeCall(question.id, user.id)
		const option = await makeOption(question.id)
		await makeSelection(call.id, option.id)

		const admin = await makeAdmin()
		const data = await expectData<{
			adminQueueSummary: Result<{ data: { needsResolution: { id: string }[] } }>
		}>(QUEUE, { as: admin })
		expect(
			data.adminQueueSummary.data.needsResolution.map((q) => q.id),
		).toContain(question.id)
	})
})
