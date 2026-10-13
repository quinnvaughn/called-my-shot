import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "../../db"
import {
	notifications as notificationsTable,
	type Question,
	questions,
	userBlocks,
} from "../../db/schema"
import {
	makeCall,
	makeGroup,
	makeQuestion,
	makeSelection,
	makeUser,
	makeYesNoOptions,
	pastDate,
} from "../../test/factories"
import { resolve } from "../../test/helpers"
import { setModerationProvider } from "../moderation"
import { markQuestionVoided } from "../void-question"
import { acceptChallenge } from "./accept"
import { createChallenge } from "./create"
import {
	canGloat,
	dismissGloatReport,
	removeGloat,
	reportGloat,
	sendChallengeGloat,
} from "./gloat"
import { loadChallengeQuestionFacts } from "./load"
import {
	buildMatchups,
	challengeState,
	creatorTally,
	loadChallengePoints,
} from "./outcome"
import { headToHead } from "./record"

type YesNo = Question & { yes: string; no: string }

async function openYesNo(): Promise<YesNo> {
	const question = await makeQuestion()
	const { yes, no } = await makeYesNoOptions(question.id)
	return { ...question, yes: yes.id, no: no.id }
}

// A call on a yes/no question, written straight to the tables.
async function callOn(q: YesNo, userId: string, side: "yes" | "no", c = 100) {
	const call = await makeCall(q.id, userId)
	await makeSelection(call.id, q[side], c)
	return call
}

const pick = (q: YesNo, side: "yes" | "no", conviction = 100) => ({
	questionId: q.id,
	selections: [{ optionId: q[side], conviction }],
})

const create = (
	creator: { id: string; username: string },
	questionIds: string[],
	groupIds: string[] = [],
) =>
	db.transaction((tx) =>
		createChallenge(tx, creator, { questionIds, groupIds }),
	)

const accept = (
	acceptor: { id: string; username: string },
	code: string,
	calls: { questionId: string }[] = [],
) => db.transaction((tx) => acceptChallenge(tx, acceptor, code, calls))

// Settles a question the way the lock job and a resolver would.
async function settle(q: YesNo, side: "yes" | "no") {
	const [locked] = await db
		.update(questions)
		.set({ status: "locked", locksAt: pastDate(1) })
		.where(eq(questions.id, q.id))
		.returning()
	return resolve(locked, { correctOptionIds: [q[side]] })
}

async function matchupsOf(challengeId: string, creatorId: string) {
	const facts = (await loadChallengeQuestionFacts([challengeId])).get(
		challengeId,
	)
	const acceptances = await db.query.challengeAcceptances.findMany({
		where: { challengeId },
	})
	const pointsOf = await loadChallengePoints(
		[challengeId],
		[creatorId, ...acceptances.map((a) => a.acceptorId)],
	)
	const state = challengeState(facts ?? [])
	return {
		state,
		matchups: buildMatchups({
			challengeId,
			creatorId,
			state,
			acceptances,
			pointsOf,
		}),
	}
}

describe("createChallenge", () => {
	it("keeps the questions in the order they were picked", async () => {
		const creator = await makeUser()
		const [a, b] = [await openYesNo(), await openYesNo()]
		const challenge = await create(creator, [b.id, a.id, b.id])

		expect(challenge.code).toHaveLength(6)
		const facts = (await loadChallengeQuestionFacts([challenge.id])).get(
			challenge.id,
		)
		expect(facts?.map((f) => f.id)).toEqual([b.id, a.id])
	})

	it("refuses a question that's already locked", async () => {
		const creator = await makeUser()
		const locked = await makeQuestion({ locksAt: pastDate(1) })
		await expect(create(creator, [locked.id])).rejects.toThrow(
			"Every question in a challenge has to still be open.",
		)
	})

	it("posts to the creator's groups and tells everyone else there", async () => {
		const creator = await makeUser()
		const member = await makeUser()
		const group = await makeGroup({ admin: creator, members: [member] })
		const q = await openYesNo()
		const challenge = await create(creator, [q.id], [group.id])

		const notices = await db.query.notifications.findMany({
			where: { challengeId: challenge.id },
		})
		expect(notices.map((n) => [n.type, n.userId])).toEqual([
			["challenge_posted_to_group", member.id],
		])
	})

	it("won't post to a group the creator isn't in", async () => {
		const creator = await makeUser()
		const group = await makeGroup({ admin: await makeUser() })
		const q = await openYesNo()
		await expect(create(creator, [q.id], [group.id])).rejects.toThrow(
			"You're not a member of that group.",
		)
	})
})

describe("acceptChallenge", () => {
	it("makes every missing call and the acceptance together, and tells the creator", async () => {
		const [creator, acceptor] = [await makeUser(), await makeUser()]
		const [a, b] = [await openYesNo(), await openYesNo()]
		const challenge = await create(creator, [a.id, b.id])

		await accept(acceptor, challenge.code, [pick(a, "no"), pick(b, "yes")])

		const calls = await db.query.calls.findMany({
			where: { userId: acceptor.id },
		})
		expect(calls).toHaveLength(2)
		const notice = await db.query.notifications.findFirst({
			where: { userId: creator.id, challengeId: challenge.id },
		})
		expect(notice?.type).toBe("challenge_accepted")
		expect(notice?.actorId).toBe(acceptor.id)
	})

	it("counts a call the acceptor already made", async () => {
		const [creator, acceptor] = [await makeUser(), await makeUser()]
		const [a, b] = [await openYesNo(), await openYesNo()]
		await callOn(a, acceptor.id, "yes")
		const challenge = await create(creator, [a.id, b.id])

		await accept(acceptor, challenge.code, [pick(b, "no")])
		expect(
			await db.query.challengeAcceptances.findMany({
				where: { challengeId: challenge.id },
			}),
		).toHaveLength(1)
	})

	it("refuses to go ahead without a call on every question", async () => {
		const [creator, acceptor] = [await makeUser(), await makeUser()]
		const [a, b] = [await openYesNo(), await openYesNo()]
		const challenge = await create(creator, [a.id, b.id])

		await expect(
			accept(acceptor, challenge.code, [pick(a, "no")]),
		).rejects.toThrow("Call every question in the challenge to take it on.")
	})

	it("writes nothing when one of the calls is bad", async () => {
		const [creator, acceptor] = [await makeUser(), await makeUser()]
		const [a, b] = [await openYesNo(), await openYesNo()]
		const challenge = await create(creator, [a.id, b.id])

		await expect(
			accept(acceptor, challenge.code, [
				pick(a, "no"),
				{ questionId: b.id, selections: [{ optionId: a.yes, conviction: 50 }] },
			]),
		).rejects.toThrow()
		expect(
			await db.query.calls.findMany({ where: { userId: acceptor.id } }),
		).toHaveLength(0)
	})

	it("refuses a second call on a question already called", async () => {
		const [creator, acceptor] = [await makeUser(), await makeUser()]
		const a = await openYesNo()
		await callOn(a, acceptor.id, "yes")
		const challenge = await create(creator, [a.id])

		await expect(
			accept(acceptor, challenge.code, [pick(a, "no")]),
		).rejects.toThrow("You've already called that question.")
	})

	it("refuses the creator, a second accept, and anyone blocked", async () => {
		const [creator, acceptor, blocked] = [
			await makeUser(),
			await makeUser(),
			await makeUser(),
		]
		const a = await openYesNo()
		const challenge = await create(creator, [a.id])
		await db
			.insert(userBlocks)
			.values({ blockerId: creator.id, blockedId: blocked.id })

		await expect(
			accept(creator, challenge.code, [pick(a, "yes")]),
		).rejects.toThrow("You can't take on your own challenge.")
		await accept(acceptor, challenge.code, [pick(a, "no")])
		await expect(accept(acceptor, challenge.code)).rejects.toThrow(
			"You've already taken this one on.",
		)
		await expect(
			accept(blocked, challenge.code, [pick(a, "no")]),
		).rejects.toThrow("You can't take on this challenge.")
	})

	it("closes once the first question locks", async () => {
		const [creator, acceptor] = [await makeUser(), await makeUser()]
		const [a, b] = [await openYesNo(), await openYesNo()]
		const challenge = await create(creator, [a.id, b.id])
		// Past its lock but not yet flipped by the lock job.
		await db
			.update(questions)
			.set({ locksAt: pastDate(1) })
			.where(eq(questions.id, a.id))

		await expect(
			accept(acceptor, challenge.code, [pick(a, "no"), pick(b, "no")]),
		).rejects.toThrow("This challenge closed when its first question locked.")
	})
})

describe("challenge outcomes", () => {
	it("goes to whoever has more challenge points once everything settles", async () => {
		const [creator, right, wrong] = [
			await makeUser(),
			await makeUser(),
			await makeUser(),
		]
		const a = await openYesNo()
		await callOn(a, creator.id, "yes", 50)
		const challenge = await create(creator, [a.id])
		await accept(right, challenge.code, [pick(a, "yes", 100)])
		await accept(wrong, challenge.code, [pick(a, "no", 100)])

		expect((await matchupsOf(challenge.id, creator.id)).state).toBe("open")
		await settle(a, "yes")

		const { state, matchups } = await matchupsOf(challenge.id, creator.id)
		expect(state).toBe("settled")
		const outcomeFor = (userId: string) =>
			matchups.find((m) => m.acceptance.acceptorId === userId)?.outcome
		// Same side, more conviction: the bolder hit wins.
		expect(outcomeFor(right.id)).toBe("acceptor")
		expect(outcomeFor(wrong.id)).toBe("creator")
		expect(creatorTally(matchups)).toEqual({ wins: 1, losses: 1, draws: 0 })
	})

	it("scores a question the creator never called as 0 for them", async () => {
		const [creator, acceptor] = [await makeUser(), await makeUser()]
		const a = await openYesNo()
		const challenge = await create(creator, [a.id])
		await accept(acceptor, challenge.code, [pick(a, "no", 100)])
		await settle(a, "yes")

		const { matchups } = await matchupsOf(challenge.id, creator.id)
		expect(matchups[0].creator.total).toBe(0)
		expect(matchups[0].acceptor.total).toBeLessThan(0)
		expect(matchups[0].outcome).toBe("creator")
	})

	it("calls it a draw on equal points", async () => {
		const [creator, acceptor] = [await makeUser(), await makeUser()]
		const a = await openYesNo()
		await callOn(a, creator.id, "yes", 60)
		const challenge = await create(creator, [a.id])
		await accept(acceptor, challenge.code, [pick(a, "yes", 60)])
		await settle(a, "yes")

		const { matchups } = await matchupsOf(challenge.id, creator.id)
		expect(matchups[0].outcome).toBe("draw")
	})

	it("drops a voided question and voids the challenge when they all are", async () => {
		const [creator, acceptor] = [await makeUser(), await makeUser()]
		const [a, b] = [await openYesNo(), await openYesNo()]
		await callOn(a, creator.id, "yes")
		await callOn(b, creator.id, "yes")
		const challenge = await create(creator, [a.id, b.id])
		await accept(acceptor, challenge.code, [pick(a, "no"), pick(b, "no")])

		const voidIt = (q: Question) =>
			db.transaction((tx) =>
				markQuestionVoided(tx, q, {
					reason: "subject_did_not_play",
					note: "",
					voidedBy: { method: "system" },
				}),
			)
		await voidIt(a)
		await settle(b, "no")
		const settled = await matchupsOf(challenge.id, creator.id)
		expect(settled.state).toBe("settled")
		expect(settled.matchups[0].outcome).toBe("acceptor")

		await voidIt(
			(await db.query.questions.findFirst({ where: { id: b.id } })) as Question,
		)
		expect((await matchupsOf(challenge.id, creator.id)).state).toBe("voided")
	})

	it("follows an overturn", async () => {
		const [creator, acceptor] = [await makeUser(), await makeUser()]
		const a = await openYesNo()
		await callOn(a, creator.id, "yes")
		const challenge = await create(creator, [a.id])
		await accept(acceptor, challenge.code, [pick(a, "no")])

		const resolved = await settle(a, "yes")
		expect(
			(await matchupsOf(challenge.id, creator.id)).matchups[0].outcome,
		).toBe("creator")
		await resolve(resolved, { correctOptionIds: [a.no] })
		expect(
			(await matchupsOf(challenge.id, creator.id)).matchups[0].outcome,
		).toBe("acceptor")
	})

	it("keeps a head-to-head record both ways", async () => {
		const [me, them] = [await makeUser(), await makeUser()]
		const [a, b] = [await openYesNo(), await openYesNo()]
		await callOn(a, me.id, "yes")
		const mine = await create(me, [a.id])
		await accept(them, mine.code, [pick(a, "no")])
		await callOn(b, them.id, "yes")
		const theirs = await create(them, [b.id])
		await accept(me, theirs.code, [pick(b, "no")])

		await settle(a, "yes")
		// One settled, one still to play: only the first counts.
		expect(await headToHead(me.id, them.id)).toEqual({
			wins: 1,
			losses: 0,
			draws: 0,
		})
		await settle(b, "yes")
		expect(await headToHead(me.id, them.id)).toEqual({
			wins: 1,
			losses: 1,
			draws: 0,
		})
		expect(await headToHead(them.id, me.id)).toEqual({
			wins: 1,
			losses: 1,
			draws: 0,
		})
	})
})

describe("notifyChallengesSettled", () => {
	it("tells everyone once the last question settles, and again only if a result moves", async () => {
		const [creator, acceptor] = [await makeUser(), await makeUser()]
		const [a, b] = [await openYesNo(), await openYesNo()]
		await callOn(a, creator.id, "yes")
		await callOn(b, creator.id, "yes")
		const challenge = await create(creator, [a.id, b.id])
		await accept(acceptor, challenge.code, [pick(a, "no"), pick(b, "no")])

		const settledNotices = () =>
			db.query.notifications.findMany({
				where: { challengeId: challenge.id, type: "challenge_settled" },
			})

		await settle(a, "yes")
		expect(await settledNotices()).toHaveLength(0)

		const resolvedB = await settle(b, "yes")
		const first = await settledNotices()
		expect(first.map((n) => n.userId).sort()).toEqual(
			[creator.id, acceptor.id].sort(),
		)

		await db
			.update(notificationsTable)
			.set({ readAt: new Date() })
			.where(eq(notificationsTable.challengeId, challenge.id))
		await resolve(resolvedB, { correctOptionIds: [b.yes] })
		expect((await settledNotices()).every((n) => n.readAt !== null)).toBe(true)

		await resolve(resolvedB, { correctOptionIds: [b.no] })
		const again = await settledNotices()
		expect(again).toHaveLength(2)
		expect(again.every((n) => n.readAt === null)).toBe(true)
	})
})

describe("gloats", () => {
	// A settled challenge: the creator beat `losers`, and `winner` beat the
	// creator.
	async function settledChallenge() {
		const [creator, loserA, loserB, winner] = [
			await makeUser(),
			await makeUser(),
			await makeUser(),
			await makeUser(),
		]
		const a = await openYesNo()
		await callOn(a, creator.id, "yes", 50)
		const challenge = await create(creator, [a.id])
		await accept(loserA, challenge.code, [pick(a, "no")])
		await accept(loserB, challenge.code, [pick(a, "no")])
		await accept(winner, challenge.code, [pick(a, "yes", 100)])
		const resolved = await settle(a, "yes")
		return { creator, loserA, loserB, winner, challenge, a, resolved }
	}

	const gif = {
		id: "dunk-1",
		url: "https://static.klipy.com/dunk.gif",
		width: 320,
		height: 240,
		alt: "dunk",
	}

	it("waits for the challenge to settle", async () => {
		const [creator, acceptor] = [await makeUser(), await makeUser()]
		const a = await openYesNo()
		const challenge = await create(creator, [a.id])
		await accept(acceptor, challenge.code, [pick(a, "no")])
		await expect(
			sendChallengeGloat(creator, challenge.id, { text: "told you" }),
		).rejects.toThrow("You can talk trash once the challenge is over.")
	})

	it("sends the creator's one gloat to everyone they beat", async () => {
		const { creator, loserA, loserB, winner, challenge } =
			await settledChallenge()
		expect(await canGloat(creator, challenge)).toBe(true)

		const gloat = await sendChallengeGloat(creator, challenge.id, {
			text: "Check the board.",
			gif,
		})
		expect(gloat.gifId).toBe("dunk-1")
		const notified = await db.query.notifications.findMany({
			where: { challengeId: challenge.id, type: "challenge_gloated" },
		})
		expect(notified.map((n) => n.userId).sort()).toEqual(
			[loserA.id, loserB.id].sort(),
		)
		expect(notified.some((n) => n.userId === winner.id)).toBe(false)

		expect(await canGloat(creator, challenge)).toBe(false)
		await expect(
			sendChallengeGloat(creator, challenge.id, { text: "again" }),
		).rejects.toThrow("You've already talked trash on this one.")
	})

	it("lets only a winner gloat, and an acceptor only at the creator", async () => {
		const { creator, loserA, winner, challenge } = await settledChallenge()
		await expect(
			sendChallengeGloat(loserA, challenge.id, { text: "nope" }),
		).rejects.toThrow("Only the winner of a 1v1 can talk trash.")

		await sendChallengeGloat(winner, challenge.id, { text: "Got you." })
		const notice = await db.query.notifications.findFirst({
			where: { challengeId: challenge.id, type: "challenge_gloated" },
		})
		expect(notice?.userId).toBe(creator.id)
	})

	it("needs words or a GIF, and runs the words through moderation", async () => {
		const { creator, challenge } = await settledChallenge()
		await expect(
			sendChallengeGloat(creator, challenge.id, { text: "   " }),
		).rejects.toThrow("Say something or pick a GIF")

		setModerationProvider({
			check: async () => ({ ok: false, category: "harassment" }),
		})
		try {
			await expect(
				sendChallengeGloat(creator, challenge.id, { text: "fine words" }),
			).rejects.toThrow("That reads as harassment.")
		} finally {
			setModerationProvider(null)
		}
	})

	it("refuses an acceptor's gloat across a block", async () => {
		const { creator, winner, challenge } = await settledChallenge()
		await db
			.insert(userBlocks)
			.values({ blockerId: creator.id, blockedId: winner.id })
		await expect(
			sendChallengeGloat(winner, challenge.id, { gif }),
		).rejects.toThrow("You can't send this one.")
	})

	it("takes reports once each, and removing one closes the rest", async () => {
		const { creator, loserA, loserB, challenge } = await settledChallenge()
		const gloat = await sendChallengeGloat(creator, challenge.id, {
			text: "Check the board.",
		})
		const admin = await makeUser({ isAdmin: true })

		const first = await reportGloat(loserA, {
			gloatId: gloat.id,
			reason: "harassment",
			details: "",
		})
		await expect(
			reportGloat(loserA, { gloatId: gloat.id, reason: "spam", details: "" }),
		).rejects.toThrow("You've already reported this.")
		await reportGloat(loserB, {
			gloatId: gloat.id,
			reason: "spam",
			details: "",
		})

		await removeGloat(admin, first.id)
		const reports = await db.query.gloatReports.findMany({
			where: { gloatId: gloat.id },
		})
		expect(reports.every((r) => r.status === "removed")).toBe(true)
		const removed = await db.query.gloats.findFirst({ where: { id: gloat.id } })
		expect(removed?.removedAt).not.toBeNull()
		await expect(dismissGloatReport(admin, first.id)).rejects.toThrow(
			"Report not found",
		)
	})
})
