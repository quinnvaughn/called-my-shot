import { describe, expect, it } from "vitest"
import { db } from "../../../../db"
import type { User } from "../../../../db/schema"
import { loadOpenGloats } from "../../../../lib/fades"
import {
	makeCall,
	makeRedoGrant,
	makeSelection,
	makeUser,
	seedOptionQuestion,
} from "../../../../test/factories"
import { expectData } from "../../../../test/graphql"
import { hoursAgo, hoursFromNow, resolve } from "../../../../test/helpers"

const CAST_CALL = /* GraphQL */ `
	mutation CastCall($input: CastCallInput!) {
		castCall(input: $input) {
			__typename
			... on CastCallPayload { call { id } }
			... on ValidationError { fieldErrors { message } }
		}
	}
`

const ATTACH_FADE = /* GraphQL */ `
	mutation AttachFade($input: AttachFadeInput!) {
		attachFade(input: $input) {
			__typename
			... on AttachFadePayload { call { id } }
			... on ValidationError { fieldErrors { message } }
		}
	}
`

const GLOAT = /* GraphQL */ `
	mutation Gloat($input: GloatInput!) {
		gloat(input: $input) {
			__typename
			... on GloatPayload { fades { id gloat } }
			... on ValidationError { fieldErrors { message } }
		}
	}
`

const REDO_CALL = /* GraphQL */ `
	mutation RedoCall($input: RedoCallInput!) {
		redoCall(input: $input) {
			__typename
		}
	}
`

const CALL = /* GraphQL */ `
	query Call($id: ID!) {
		call(id: $id) {
			fadeOffer { mode option { label } }
			doubters {
				id
				targetFlippedAt
				winner
				gloat
				call { user { username } }
			}
			fading { target { id } }
			viewerGloat { audience count fadeId targetUsername }
		}
	}
`

type CallView = {
	call: {
		fadeOffer: { mode: string; option: { label: string } } | null
		doubters: {
			id: string
			targetFlippedAt: string | null
			winner: string | null
			gloat: string | null
			call: { user: { username: string } }
		}[]
		fading: { target: { id: string } } | null
		viewerGloat: {
			audience: string
			count: number
			fadeId: string | null
			targetUsername: string | null
		} | null
	}
}

function viewCall(id: string, as: User | null) {
	return expectData<CallView>(CALL, { as, variables: { id } })
}

// A yes/no question with OP's call on Yes, still open.
async function seedTarget(
	question: Parameters<typeof seedOptionQuestion>[0]["question"] = {},
) {
	const seeded = await seedOptionQuestion({
		callers: [{ optionIndex: 0, conviction: 80 }],
		question: { locksAt: hoursFromNow(4), ...question },
	})
	const [yes, no] = seeded.options
	const { call: target, user: op } = seeded.callers[0]
	return { ...seeded, yes, no, target, op }
}

async function fadeFresh(
	fader: User,
	targetCallId: string,
	optionId: string,
	questionId: string,
) {
	return expectData<{
		castCall: {
			__typename: string
			call?: { id: string }
			fieldErrors?: { message: string }[]
		}
	}>(CAST_CALL, {
		as: fader,
		variables: {
			input: {
				questionId,
				selections: [{ optionId, conviction: 60 }],
				fadesCallId: targetCallId,
			},
		},
	})
}

describe("castCall with fadesCallId", () => {
	it("casts the call, links it to the target, and tells the target", async () => {
		const { question, no, target, op } = await seedTarget()
		const fader = await makeUser()

		const data = await fadeFresh(fader, target.id, no.id, question.id)
		expect(data.castCall.__typename).toBe("CastCallPayload")

		const fade = await db.query.callFades.findFirst({
			where: { targetCallId: target.id },
		})
		expect(fade?.faderCallId).toBe(data.castCall.call?.id)

		const notification = await db.query.notifications.findFirst({
			where: { userId: op.id, type: "call_faded" },
		})
		expect(notification?.actorId).toBe(fader.id)
		expect(notification?.callId).toBe(target.id)

		const view = await viewCall(target.id, null)
		expect(view.call.doubters.map((d) => d.call.user.username)).toEqual([
			fader.username,
		])
	})

	it("rejects a fade on the same side", async () => {
		const { question, yes, target } = await seedTarget()
		const fader = await makeUser()

		const data = await fadeFresh(fader, target.id, yes.id, question.id)
		expect(data.castCall.__typename).toBe("ValidationError")
		// The call rolls back with the fade.
		expect(
			await db.query.calls.findFirst({ where: { userId: fader.id } }),
		).toBeUndefined()
	})

	it("rejects a question that isn't two-sided", async () => {
		const seeded = await seedOptionQuestion({
			shape: "player_game_stat_leader",
			optionLabels: ["A", "B", "C"],
			callers: [{ optionIndex: 0 }],
			question: { locksAt: hoursFromNow(4) },
		})
		const fader = await makeUser()

		const data = await fadeFresh(
			fader,
			seeded.callers[0].call.id,
			seeded.options[1].id,
			seeded.question.id,
		)
		expect(data.castCall.__typename).toBe("ValidationError")
	})

	it("rejects a locked question", async () => {
		const { question, no, target } = await seedTarget({
			locksAt: hoursAgo(1),
		})
		const fader = await makeUser()

		const data = await fadeFresh(fader, target.id, no.id, question.id)
		expect(data.castCall.__typename).toBe("ValidationError")
	})
})

describe("attachFade", () => {
	async function seedOpposing() {
		const seeded = await seedTarget()
		const fader = await makeUser()
		const faderCall = await makeCall(seeded.question.id, fader.id)
		await makeSelection(faderCall.id, seeded.no.id, 70)
		return { ...seeded, fader, faderCall }
	}

	it("aims an existing call on the other side", async () => {
		const { target, fader, faderCall } = await seedOpposing()

		expect((await viewCall(target.id, fader)).call.fadeOffer?.mode).toBe(
			"ATTACH",
		)

		const data = await expectData<{ attachFade: { __typename: string } }>(
			ATTACH_FADE,
			{ as: fader, variables: { input: { targetCallId: target.id } } },
		)
		expect(data.attachFade.__typename).toBe("AttachFadePayload")

		const fade = await db.query.callFades.findFirst({
			where: { faderCallId: faderCall.id },
		})
		expect(fade?.targetCallId).toBe(target.id)
		// Already fading someone, so no second offer.
		expect((await viewCall(target.id, fader)).call.fadeOffer).toBeNull()
	})

	it("rejects a call that already fades someone", async () => {
		const { question, yes, target, fader } = await seedOpposing()
		const other = await makeUser()
		const otherCall = await makeCall(question.id, other.id)
		await makeSelection(otherCall.id, yes.id, 50)

		await expectData(ATTACH_FADE, {
			as: fader,
			variables: { input: { targetCallId: target.id } },
		})
		const second = await expectData<{ attachFade: { __typename: string } }>(
			ATTACH_FADE,
			{ as: fader, variables: { input: { targetCallId: otherCall.id } } },
		)
		expect(second.attachFade.__typename).toBe("ValidationError")
	})

	it("rejects fading your own call", async () => {
		const { target, op } = await seedTarget()
		const data = await expectData<{
			attachFade: { __typename: string; fieldErrors?: { message: string }[] }
		}>(ATTACH_FADE, {
			as: op,
			variables: { input: { targetCallId: target.id } },
		})
		expect(data.attachFade.fieldErrors?.[0]?.message).toBe(
			"You can't fade your own call.",
		)
	})

	it("rejects a call on the same side", async () => {
		const { question, yes, target } = await seedTarget()
		const sameSide = await makeUser()
		const call = await makeCall(question.id, sameSide.id)
		await makeSelection(call.id, yes.id, 50)

		expect((await viewCall(target.id, sameSide)).call.fadeOffer).toBeNull()
		const data = await expectData<{ attachFade: { __typename: string } }>(
			ATTACH_FADE,
			{ as: sameSide, variables: { input: { targetCallId: target.id } } },
		)
		expect(data.attachFade.__typename).toBe("ValidationError")
	})
})

describe("Call.fadeOffer", () => {
	it("offers NEW to signed-out viewers and viewers with no call, and nothing to OP", async () => {
		const { target, op } = await seedTarget()
		const stranger = await makeUser()

		const anon = await viewCall(target.id, null)
		expect(anon.call.fadeOffer).toEqual({
			mode: "NEW",
			option: { label: "No" },
		})
		expect((await viewCall(target.id, stranger)).call.fadeOffer?.mode).toBe(
			"NEW",
		)
		expect((await viewCall(target.id, op)).call.fadeOffer).toBeNull()
	})
})

describe("redo after a fade", () => {
	it("drops the fade when the fader redoes onto the target's side", async () => {
		const { question, yes, no, target } = await seedTarget()
		const fader = await makeUser()
		const cast = await fadeFresh(fader, target.id, no.id, question.id)
		await makeRedoGrant(fader.id)

		await expectData(REDO_CALL, {
			as: fader,
			variables: {
				input: {
					callId: cast.castCall.call?.id,
					selections: [{ optionId: yes.id, conviction: 50 }],
				},
			},
		})

		expect(
			await db.query.callFades.findFirst({
				where: { targetCallId: target.id },
			}),
		).toBeUndefined()
	})

	it("keeps the fade and marks it flipped when the target redoes onto the fader's side", async () => {
		const { question, no, target, op } = await seedTarget()
		const fader = await makeUser()
		await fadeFresh(fader, target.id, no.id, question.id)
		await makeRedoGrant(op.id)

		await expectData(REDO_CALL, {
			as: op,
			variables: {
				input: {
					callId: target.id,
					selections: [{ optionId: no.id, conviction: 50 }],
				},
			},
		})

		const [doubter] = (await viewCall(target.id, null)).call.doubters
		expect(doubter?.targetFlippedAt).not.toBeNull()
	})
})

describe("gloat", () => {
	// OP on Yes, faded by the given number of callers on No, then resolved.
	async function seedSettled(correct: "yes" | "no", faders = 1) {
		const seeded = await seedTarget()
		const users = []
		for (let i = 0; i < faders; i++) {
			const fader = await makeUser()
			await fadeFresh(fader, seeded.target.id, seeded.no.id, seeded.question.id)
			users.push(fader)
		}
		const fades = await db.query.callFades.findMany({
			where: { targetCallId: seeded.target.id },
		})
		await resolve(seeded.question, {
			correctOptionIds: [correct === "yes" ? seeded.yes.id : seeded.no.id],
		})
		return { ...seeded, faders: users, fades }
	}

	function gloat(
		as: User,
		input: { fadeId?: string; callId?: string; message: string },
	) {
		return expectData<{
			gloat: { __typename: string; fades?: { id: string; gloat: string }[] }
		}>(GLOAT, { as, variables: { input } })
	}

	it("lets a doubter who cashed gloat once and tells OP", async () => {
		const { faders, fades, op, target } = await seedSettled("no")
		const [fader] = faders
		const [fade] = fades
		if (!fader || !fade) throw new Error("seed missing")

		const view = await viewCall(target.id, fader)
		expect(view.call.doubters[0]?.winner).toBe("FADER")
		expect(view.call.viewerGloat).toMatchObject({
			audience: "TARGET",
			fadeId: fade.id,
			targetUsername: op.username,
		})

		const first = await gloat(fader, { fadeId: fade.id, message: "CALLED_IT" })
		expect(first.gloat.fades?.[0]?.gloat).toBe("CALLED_IT")
		expect(
			(await gloat(fader, { fadeId: fade.id, message: "CALLED_IT" })).gloat
				.__typename,
		).toBe("ValidationError")

		const notifications = await db.query.notifications.findMany({
			where: { userId: op.id, type: "fade_gloated" },
		})
		expect(notifications).toHaveLength(1)
		expect(notifications[0]?.callId).toBe(target.id)
		expect((await viewCall(target.id, fader)).call.viewerGloat).toBeNull()
	})

	it("sends OP's gloat to every doubter who was wrong at once", async () => {
		const { faders, op, target } = await seedSettled("yes", 3)

		const view = await viewCall(target.id, op)
		expect(view.call.viewerGloat).toMatchObject({
			audience: "DOUBTERS",
			count: 3,
		})

		const data = await gloat(op, { callId: target.id, message: "TOLD_YOU" })
		expect(data.gloat.fades).toHaveLength(3)

		for (const fader of faders) {
			const notifications = await db.query.notifications.findMany({
				where: { userId: fader.id, type: "fade_gloated" },
			})
			expect(notifications).toHaveLength(1)
		}
		const after = await viewCall(target.id, op)
		expect(after.call.viewerGloat).toBeNull()
		expect(after.call.doubters.map((d) => d.gloat)).toEqual([
			"TOLD_YOU",
			"TOLD_YOU",
			"TOLD_YOU",
		])
	})

	it("rejects a line from the other side's list", async () => {
		const { op, target } = await seedSettled("yes")
		const data = await gloat(op, { callId: target.id, message: "CALLED_IT" })
		expect(data.gloat.__typename).toBe("ValidationError")
	})

	it("rejects the losing side", async () => {
		const { faders, fades } = await seedSettled("yes")
		const [fader] = faders
		const [fade] = fades
		if (!fader || !fade) throw new Error("seed missing")
		expect(
			(await gloat(fader, { fadeId: fade.id, message: "CALLED_IT" })).gloat
				.__typename,
		).toBe("ValidationError")
	})

	it("rejects a gloat before the question settles", async () => {
		const { question, no, target, op } = await seedTarget()
		const fader = await makeUser()
		await fadeFresh(fader, target.id, no.id, question.id)

		expect((await viewCall(target.id, op)).call.viewerGloat).toBeNull()
		expect(
			(await gloat(op, { callId: target.id, message: "TOLD_YOU" })).gloat
				.__typename,
		).toBe("ValidationError")
	})

	it("moves the win to the other side on a re-resolve and hides the old gloat", async () => {
		const { faders, fades, op, question, yes, target } = await seedSettled("no")
		const [fader] = faders
		const [fade] = fades
		if (!fader || !fade) throw new Error("seed missing")
		await gloat(fader, { fadeId: fade.id, message: "CALLED_IT" })

		const refreshed = await db.query.questions.findFirst({
			where: { id: question.id },
		})
		if (!refreshed) throw new Error("question missing")
		await resolve(refreshed, { correctOptionIds: [yes.id] })

		const view = await viewCall(target.id, op)
		expect(view.call.doubters[0]?.winner).toBe("TARGET")
		expect(view.call.doubters[0]?.gloat).toBeNull()
		expect(view.call.viewerGloat?.audience).toBe("DOUBTERS")
	})

	it("lists the same open gloats the call page offers, until they're sent", async () => {
		const { faders, fades, op, target } = await seedSettled("no")
		const [fader] = faders
		const [fade] = fades
		if (!fader || !fade) throw new Error("seed missing")

		const before = await loadOpenGloats(db, [fade.faderCallId, target.id])
		expect(before.get(fade.faderCallId)).toEqual({
			audience: "target",
			username: op.username,
		})
		expect(before.has(target.id)).toBe(false)

		await gloat(fader, { fadeId: fade.id, message: "CALLED_IT" })
		expect((await loadOpenGloats(db, [fade.faderCallId])).size).toBe(0)
	})

	it("counts every wrong doubter on the target's call", async () => {
		const { op, target } = await seedSettled("yes", 2)
		expect((await loadOpenGloats(db, [target.id])).get(target.id)).toEqual({
			audience: "doubters",
			count: 2,
		})
		await gloat(op, { callId: target.id, message: "TOLD_YOU" })
		expect((await loadOpenGloats(db, [target.id])).size).toBe(0)
	})
})

describe("call_resolved fade summary", () => {
	const NOTIFICATIONS = /* GraphQL */ `
		query Notifications {
			notifications {
				... on QueryNotificationsSuccess {
					data { items {
						... on CallResolvedNotification {
							fade {
								fadedUsername
								fadeLanded
								targetFlipped
								doubterCount
								doubtersCashed
								doubtersWrong
								gloatOpen
							}
						}
					} }
				}
			}
		}
	`

	type Result = {
		notifications: {
			data: {
				items: {
					fade?: {
						fadedUsername: string | null
						fadeLanded: boolean | null
						targetFlipped: boolean
						doubterCount: number
						doubtersCashed: number
						gloatOpen: boolean
					} | null
				}[]
			}
		}
	}

	it("tells both sides how the fade went", async () => {
		const { question, no, target, op } = await seedTarget()
		const fader = await makeUser()
		await fadeFresh(fader, target.id, no.id, question.id)
		await resolve(question, { correctOptionIds: [no.id] })

		const forFader = await expectData<Result>(NOTIFICATIONS, { as: fader })
		expect(forFader.notifications.data.items[0]?.fade).toEqual({
			fadedUsername: op.username,
			fadeLanded: true,
			targetFlipped: false,
			doubterCount: 0,
			doubtersCashed: 0,
			doubtersWrong: 0,
			gloatOpen: true,
		})

		const forOp = await expectData<Result>(NOTIFICATIONS, { as: op })
		expect(forOp.notifications.data.items[0]?.fade).toEqual({
			fadedUsername: null,
			fadeLanded: null,
			targetFlipped: false,
			doubterCount: 1,
			doubtersCashed: 1,
			doubtersWrong: 0,
			gloatOpen: false,
		})

		const fade = await db.query.callFades.findFirst({
			where: { targetCallId: target.id },
		})
		if (!fade) throw new Error("fade missing")
		await expectData(GLOAT, {
			as: fader,
			variables: { input: { fadeId: fade.id, message: "CALLED_IT" } },
		})
		const afterGloat = await expectData<Result>(NOTIFICATIONS, { as: fader })
		expect(afterGloat.notifications.data.items[0]?.fade?.gloatOpen).toBe(false)
	})
})
