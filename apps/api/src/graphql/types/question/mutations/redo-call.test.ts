import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "../../../../db"
import { callRedos, calls, redoGrants } from "../../../../db/schema"
import {
	makeOption,
	makeQuestion,
	makeRedoGrant,
	makeUser,
	seedOptionQuestion,
} from "../../../../test/factories"
import { execute, expectData } from "../../../../test/graphql"
import { hoursAgo, hoursFromNow } from "../../../../test/helpers"

const REDO_CALL = /* GraphQL */ `
	mutation RedoCall($input: RedoCallInput!) {
		redoCall(input: $input) {
			__typename
			... on RedoCallPayload {
				redoBalance
				call {
					id
					caseText
					selections { option { label } conviction }
					redo {
						originalCaseText
						originalSelections { option { label } conviction }
					}
				}
			}
			... on ValidationError { fieldErrors { message } }
			... on AuthorizationError { message }
		}
	}
`

// One question, two options, one call on the first option, and a redo in the
// wallet ready to spend.
async function seedRedoable(
	questionOverrides: Parameters<typeof makeQuestion>[0] = {},
) {
	const { question, options, callers } = await seedOptionQuestion({
		optionLabels: ["Yes", "No"],
		callers: [{ optionIndex: 0, conviction: 80 }],
		question: { locksAt: hoursFromNow(4), ...questionOverrides },
	})
	const { call, user } = callers[0]
	const grant = await makeRedoGrant(user.id)
	return { question, options, call, user, grant }
}

describe("redoCall", () => {
	it("replaces the pick and keeps the original on the redo", async () => {
		const { options, call, user } = await seedRedoable()

		const data = await expectData<{
			redoCall: {
				__typename: string
				redoBalance: number
				call: {
					id: string
					selections: { option: { label: string }; conviction: number }[]
					redo: {
						originalSelections: {
							option: { label: string }
							conviction: number
						}[]
					}
				}
			}
		}>(REDO_CALL, {
			as: user,
			variables: {
				input: {
					callId: call.id,
					selections: [{ optionId: options[1].id, conviction: 30 }],
				},
			},
		})

		const payload = data.redoCall
		expect(payload.__typename).toBe("RedoCallPayload")
		// The call id is stable - share links and scraped og:images point at it.
		expect(payload.call.id).toBe(call.id)
		expect(payload.call.selections).toEqual([
			{ option: { label: "No" }, conviction: 30 },
		])
		// Replaced, not appended.
		expect(payload.call.selections).toHaveLength(1)
		expect(payload.call.redo.originalSelections).toEqual([
			{ option: { label: "Yes" }, conviction: 80 },
		])
		expect(payload.redoBalance).toBe(0)
	})

	it("re-stamps createdAt, which is the whole cost of a redo", async () => {
		const originalCreatedAt = hoursAgo(6)
		const { options, call, user } = await seedRedoable()
		await db
			.update(calls)
			.set({ createdAt: originalCreatedAt })
			.where(eq(calls.id, call.id))

		await expectData(REDO_CALL, {
			as: user,
			variables: {
				input: {
					callId: call.id,
					selections: [{ optionId: options[1].id, conviction: 50 }],
				},
			},
		})

		const after = await db.query.calls.findFirst({ where: { id: call.id } })
		const redo = await db.query.callRedos.findFirst({
			where: { callId: call.id },
		})
		// The live column moved to now, so earliness re-ranks this call to the
		// back of the field.
		expect(after?.createdAt.getTime()).toBeGreaterThan(
			originalCreatedAt.getTime(),
		)
		// And the original time is preserved, so the call page can still say
		// when the first call was really made.
		expect(redo?.originalCreatedAt.getTime()).toBe(originalCreatedAt.getTime())
	})

	it("replaces the case and snapshots the old one", async () => {
		const { options, call, user } = await seedRedoable()
		await db
			.update(calls)
			.set({ caseText: "Secondary can't cover him" })
			.where(eq(calls.id, call.id))

		const data = await expectData<{
			redoCall: {
				call: { caseText: string; redo: { originalCaseText: string } }
			}
		}>(REDO_CALL, {
			as: user,
			variables: {
				input: {
					callId: call.id,
					caseText: "He's inactive",
					selections: [{ optionId: options[1].id, conviction: 50 }],
				},
			},
		})

		expect(data.redoCall.call.caseText).toBe("He's inactive")
		expect(data.redoCall.call.redo.originalCaseText).toBe(
			"Secondary can't cover him",
		)
	})

	it("consumes exactly one grant", async () => {
		const { options, call, user } = await seedRedoable()
		await makeRedoGrant(user.id)

		await expectData(REDO_CALL, {
			as: user,
			variables: {
				input: {
					callId: call.id,
					selections: [{ optionId: options[1].id, conviction: 50 }],
				},
			},
		})

		const grants = await db.query.redoGrants.findMany({
			where: { userId: user.id },
		})
		expect(grants.filter((g) => g.consumedAt !== null)).toHaveLength(1)
		expect(grants.filter((g) => g.consumedAt === null)).toHaveLength(1)
		expect(grants.find((g) => g.consumedAt !== null)?.consumedByCallId).toBe(
			call.id,
		)
	})

	it("refuses a second redo on the same call", async () => {
		const { options, call, user } = await seedRedoable()
		await makeRedoGrant(user.id)

		const first = {
			callId: call.id,
			selections: [{ optionId: options[1].id, conviction: 50 }],
		}
		await expectData(REDO_CALL, { as: user, variables: { input: first } })

		const data = await expectData<{
			redoCall: { __typename: string; fieldErrors: { message: string }[] }
		}>(REDO_CALL, {
			as: user,
			variables: {
				input: {
					callId: call.id,
					selections: [{ optionId: options[0].id, conviction: 50 }],
				},
			},
		})

		expect(data.redoCall.__typename).toBe("ValidationError")
		expect(data.redoCall.fieldErrors[0].message).toMatch(/already used/i)
		// The second grant is still unspent - a refused redo costs nothing.
		const unspent = await db.query.redoGrants.findMany({
			where: { userId: user.id, consumedAt: { isNull: true } },
		})
		expect(unspent).toHaveLength(1)
	})

	it("refuses once the question has locked, on the clock not the column", async () => {
		const { options, call, user } = await seedRedoable()
		// Status deliberately left "open": lock-overdue-questions only runs
		// every 15 minutes, so a row can read open well past its locksAt.
		await db
			.update(calls)
			.set({ createdAt: hoursAgo(5) })
			.where(eq(calls.id, call.id))
		const question = await db.query.questions.findFirst({
			where: { id: call.questionId },
		})
		if (!question) throw new Error("no question")
		await db.execute(
			`update questions set locks_at = now() - interval '1 minute' where id = '${question.id}'`,
		)

		const data = await expectData<{
			redoCall: { __typename: string; fieldErrors: { message: string }[] }
		}>(REDO_CALL, {
			as: user,
			variables: {
				input: {
					callId: call.id,
					selections: [{ optionId: options[1].id, conviction: 50 }],
				},
			},
		})

		expect(data.redoCall.__typename).toBe("ValidationError")
		expect(data.redoCall.fieldErrors[0].message).toMatch(/locked/i)
	})

	it("refuses with an empty wallet and says how to get one", async () => {
		const { options, call, user, grant } = await seedRedoable()
		await db.delete(redoGrants).where(eq(redoGrants.id, grant.id))

		const data = await expectData<{
			redoCall: { __typename: string; fieldErrors: { message: string }[] }
		}>(REDO_CALL, {
			as: user,
			variables: {
				input: {
					callId: call.id,
					selections: [{ optionId: options[1].id, conviction: 50 }],
				},
			},
		})

		expect(data.redoCall.__typename).toBe("ValidationError")
		expect(data.redoCall.fieldErrors[0].message).toMatch(/out of redos/i)
		expect(
			await db.query.callRedos.findFirst({ where: { callId: call.id } }),
		).toBeUndefined()
	})

	it("refuses someone else's call", async () => {
		const { options, call } = await seedRedoable()
		const stranger = await makeUser()
		await makeRedoGrant(stranger.id)

		const data = await expectData<{
			redoCall: { __typename: string }
		}>(REDO_CALL, {
			as: stranger,
			variables: {
				input: {
					callId: call.id,
					selections: [{ optionId: options[1].id, conviction: 50 }],
				},
			},
		})

		expect(data.redoCall.__typename).toBe("AuthorizationError")
	})

	it("refuses a signed-out caller", async () => {
		const { options, call } = await seedRedoable()

		const result = await execute(REDO_CALL, {
			variables: {
				input: {
					callId: call.id,
					selections: [{ optionId: options[1].id, conviction: 50 }],
				},
			},
		})

		expect(
			(result.data as { redoCall: { __typename: string } } | null)?.redoCall
				.__typename,
		).toBe("AuthenticationError")
	})

	it("refuses an option from a different question", async () => {
		const { call, user } = await seedRedoable()
		const other = await makeQuestion({ locksAt: hoursFromNow(4) })
		const foreign = await makeOption(other.id, { label: "Elsewhere" })

		const data = await expectData<{
			redoCall: { __typename: string; fieldErrors: { message: string }[] }
		}>(REDO_CALL, {
			as: user,
			variables: {
				input: {
					callId: call.id,
					selections: [{ optionId: foreign.id, conviction: 50 }],
				},
			},
		})

		expect(data.redoCall.__typename).toBe("ValidationError")
		expect(data.redoCall.fieldErrors[0].message).toMatch(/don't belong/i)
		// Refused before the grant was taken.
		const unspent = await db.query.redoGrants.findMany({
			where: { userId: user.id, consumedAt: { isNull: true } },
		})
		expect(unspent).toHaveLength(1)
	})

	it("leaves the call's callCount contribution alone", async () => {
		const { options, call, user } = await seedRedoable()
		const before = await db.query.calls.findMany({
			where: { userId: user.id },
		})

		await expectData(REDO_CALL, {
			as: user,
			variables: {
				input: {
					callId: call.id,
					selections: [{ optionId: options[1].id, conviction: 50 }],
				},
			},
		})

		const after = await db.query.calls.findMany({ where: { userId: user.id } })
		// A redo rewrites a call, it doesn't make a second one - which is why
		// it needs no season-stat delta.
		expect(after).toHaveLength(before.length)
		expect(
			await db.select().from(callRedos).where(eq(callRedos.callId, call.id)),
		).toHaveLength(1)
	})
})
