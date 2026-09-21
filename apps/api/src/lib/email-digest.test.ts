import { eq, inArray, sql } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "../db"
import {
	emailOptOuts,
	emailOutbox,
	type Question,
	questions,
	users,
} from "../db/schema"
import {
	makeCall,
	makeGame,
	makeQuestion,
	makeSelection,
	seedOptionQuestion,
} from "../test/factories"
import { hoursFromNow, mailRecorder, resolve } from "../test/helpers"
import { drainResolutionDigests } from "./email-digest"
import { DRAIN_DIGESTS_LOCK, withJobLock } from "./job-lock"
import { announceOnce } from "./streaks/notices"

/** A streak milestone announced to this user, as the rebuild job would. */
async function announceMilestone(userId: string, leagueId: string) {
	await db.transaction((tx) =>
		announceOnce(tx, `milestone:${leagueId}:player_stats:call-1:5`, {
			type: "streak_milestone",
			userId,
			leagueId,
			streakFamily: "player_stats",
			achievementLabel: "NFL Player Stats",
			achievementCount: 5,
		}),
	)
}

const noticesFor = (userId: string) =>
	db.query.achievementNotices.findMany({ where: { userId } })

/**
 * Rows are only picked up once their user's OLDEST row has cleared the
 * settling window, so every test that expects a send has to age them first.
 */
async function ageOutbox(minutes = 30) {
	await db
		.update(emailOutbox)
		.set({
			createdAt: sql`now() - ${`${minutes} minutes`}::interval`,
		})
		.where(sql`sent_at is null`)
}

// 4pm Eastern, partway through the digest day that began at 9am Eastern.
const NOW = new Date("2026-09-13T20:00:00Z")
const DAY_START = new Date("2026-09-13T13:00:00Z")
const hoursFrom = (date: Date, hours: number) =>
	hoursFromNow(hours, date.getTime())

async function setOutboxCreatedAt(at: Date) {
	await db
		.update(emailOutbox)
		.set({ createdAt: at })
		.where(sql`sent_at is null`)
}

/** An unresolved call by this user on a question about a game. */
async function openCallOnGame(
	userId: string,
	startsAt: Date,
	status: Question["status"] = "open",
) {
	const game = await makeGame({ startsAt })
	const question = await makeQuestion({ gameId: game.id, status })
	await makeCall(question.id, userId)
}

describe("drainResolutionDigests day grouping", () => {
	it("holds results until the day's last open call settles, then sends one email", async () => {
		const first = await seedOptionQuestion({ callers: [{ optionIndex: 0 }] })
		const caller = first.callers[0]
		const tonightGame = await makeGame({ startsAt: hoursFrom(DAY_START, 10) })
		const second = await seedOptionQuestion({
			callers: [],
			question: { gameId: tonightGame.id },
		})
		const secondCall = await makeCall(second.question.id, caller.user.id)
		await makeSelection(secondCall.id, second.options[0].id, 100)

		await resolve(first.question, { correctOptionIds: [first.options[0].id] })
		await setOutboxCreatedAt(hoursFrom(NOW, -1))

		const early = mailRecorder()
		await drainResolutionDigests({ send: early.send, now: NOW })
		expect(early.sent).toHaveLength(0)

		await resolve(second.question, { correctOptionIds: [second.options[0].id] })
		await setOutboxCreatedAt(hoursFrom(NOW, -1))

		const late = mailRecorder()
		await drainResolutionDigests({ send: late.send, now: NOW })
		expect(late.sent).toHaveLength(1)
		expect(late.sent[0].text).toContain(first.question.title)
		expect(late.sent[0].text).toContain(second.question.title)
	})

	it("sends at the morning backstop even with a call still open", async () => {
		const { question, options, callers } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})
		await openCallOnGame(callers[0].user.id, hoursFrom(DAY_START, 10))
		await resolve(question, { correctOptionIds: [options[0].id] })
		await setOutboxCreatedAt(hoursFrom(DAY_START, -2))

		const mail = mailRecorder()
		await drainResolutionDigests({ send: mail.send, now: NOW })
		expect(mail.sent).toHaveLength(1)
	})

	it("does not wait on a game from a later day", async () => {
		const { question, options, callers } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})
		await openCallOnGame(callers[0].user.id, hoursFrom(DAY_START, 25))
		await resolve(question, { correctOptionIds: [options[0].id] })
		await setOutboxCreatedAt(hoursFrom(NOW, -1))

		const mail = mailRecorder()
		await drainResolutionDigests({ send: mail.send, now: NOW })
		expect(mail.sent).toHaveLength(1)
	})

	it("does not wait on a question left unsettled from an earlier day", async () => {
		const { question, options, callers } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})
		await openCallOnGame(callers[0].user.id, hoursFrom(DAY_START, -3), "locked")
		await resolve(question, { correctOptionIds: [options[0].id] })
		await setOutboxCreatedAt(hoursFrom(NOW, -1))

		const mail = mailRecorder()
		await drainResolutionDigests({ send: mail.send, now: NOW })
		expect(mail.sent).toHaveLength(1)
	})
})

describe("drainResolutionDigests", () => {
	it("coalesces a user's separate resolutions into one email", async () => {
		const first = await seedOptionQuestion({ callers: [{ optionIndex: 0 }] })
		const caller = first.callers[0]
		// The same person calling a second question - the Sunday-slate case
		// the digest exists for, where two games finish minutes apart.
		const second = await seedOptionQuestion({ callers: [] })
		const secondCall = await makeCall(second.question.id, caller.user.id)
		await makeSelection(secondCall.id, second.options[0].id, 100)

		await resolve(first.question, { correctOptionIds: [first.options[0].id] })
		await resolve(second.question, { correctOptionIds: [second.options[0].id] })
		await ageOutbox()

		const mail = mailRecorder()
		const result = await drainResolutionDigests({ send: mail.send })

		expect(mail.sent).toHaveLength(1)
		expect(result.sent).toBe(2)
		const [message] = mail.sent
		expect(message.to).toBe(caller.user.email)
		expect(message.text).toContain(first.question.title)
		expect(message.text).toContain(second.question.title)
	})

	it("leaves rows alone until the settling window passes", async () => {
		const { question, options } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})
		await resolve(question, { correctOptionIds: [options[0].id] })

		const mail = mailRecorder()
		await drainResolutionDigests({ send: mail.send })

		expect(mail.sent).toHaveLength(0)
		const pending = await db
			.select()
			.from(emailOutbox)
			.where(sql`sent_at is null`)
		expect(pending).toHaveLength(1)
	})

	it("sends one email per user, not one per call", async () => {
		const { question, options } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }, { optionIndex: 1 }],
		})
		await resolve(question, { correctOptionIds: [options[0].id] })
		await ageOutbox()

		const mail = mailRecorder()
		await drainResolutionDigests({ send: mail.send })

		expect(mail.sent).toHaveLength(2)
		expect(new Set(mail.sent.map((m) => m.to)).size).toBe(2)
	})

	it("skips a user who muted call results", async () => {
		const { question, options, callers } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})
		await db
			.insert(emailOptOuts)
			.values({ userId: callers[0].user.id, type: "call_resolved" })
		await resolve(question, { correctOptionIds: [options[0].id] })
		await ageOutbox()

		const mail = mailRecorder()
		await drainResolutionDigests({ send: mail.send })

		expect(mail.sent).toHaveLength(0)
		const [row] = await db.select().from(emailOutbox)
		expect(row.skippedReason).toBe("muted")
		// Resolved, not left pending - a skip is a finished state.
		expect(row.sentAt).not.toBeNull()
	})

	it("skips a user who muted everything", async () => {
		const { question, options, callers } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})
		await db
			.insert(emailOptOuts)
			.values({ userId: callers[0].user.id, type: "all" })
		await resolve(question, { correctOptionIds: [options[0].id] })
		await ageOutbox()

		const mail = mailRecorder()
		await drainResolutionDigests({ send: mail.send })

		expect(mail.sent).toHaveLength(0)
		const [row] = await db.select().from(emailOutbox)
		expect(row.skippedReason).toBe("muted")
	})

	// emailVerified gates question creation, not mail. Asserted rather than
	// left unsaid so the gate doesn't get reintroduced as an obvious-looking
	// deliverability tweak - it would silently withhold results from everyone
	// who signed up before the confirm flow existed.
	it("mails an unverified address", async () => {
		const { question, options, callers } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})
		await db
			.update(users)
			.set({ emailVerified: false })
			.where(eq(users.id, callers[0].user.id))
		await resolve(question, { correctOptionIds: [options[0].id] })
		await ageOutbox()

		const mail = mailRecorder()
		await drainResolutionDigests({ send: mail.send })

		expect(mail.sent).toHaveLength(1)
		expect(mail.sent[0].to).toBe(callers[0].user.email)
	})

	it("drops a call whose question stopped being resolved", async () => {
		const { question, options } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})
		await resolve(question, { correctOptionIds: [options[0].id] })
		// A dispute filed inside the settling window - the result is contested
		// and the share card the email points at would 404.
		await db
			.update(questions)
			.set({ status: "disputed" })
			.where(eq(questions.id, question.id))
		await ageOutbox()

		const mail = mailRecorder()
		await drainResolutionDigests({ send: mail.send })

		expect(mail.sent).toHaveLength(0)
		const [row] = await db.select().from(emailOutbox)
		expect(row.skippedReason).toBe("no_longer_resolved")
	})

	// Every link out of the email is attributed, so a visit that started in an
	// inbox is distinguishable from one that started anywhere else - and the
	// one-click header is deliberately left clean, because a mail client POSTs
	// it rather than rendering a pageview off it.
	it("tags every link it sends and leaves the one-click header untagged", async () => {
		const { question, options } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})
		await resolve(question, { correctOptionIds: [options[0].id] })
		await ageOutbox()

		const mail = mailRecorder()
		await drainResolutionDigests({ send: mail.send })

		const [message] = mail.sent
		for (const content of ["hero", "call_row", "all_calls", "unsubscribe"]) {
			expect(message.text).toContain(
				`utm_campaign=resolution_digest&utm_content=${content}`,
			)
		}
		expect(message.headers?.["List-Unsubscribe"]).not.toContain("utm_")
	})

	// The digest used to send people to the question page with ?share=1, which
	// existed only to pop open a panel offering a downloadable PNG. Both are
	// gone: what there is to share is the call's own page.
	it("points every call link at that call's own page", async () => {
		const { question, options, callers } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})
		await resolve(question, { correctOptionIds: [options[0].id] })
		await ageOutbox()

		const mail = mailRecorder()
		await drainResolutionDigests({ send: mail.send })

		const [message] = mail.sent
		expect(message.text).toContain(`/calls/${callers[0].call.id}`)
		expect(message.text).not.toContain("share=1")
		expect(message.text).not.toContain(`/questions/${question.id}`)
	})

	it("carries a working one-click unsubscribe header", async () => {
		const { question, options } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})
		await resolve(question, { correctOptionIds: [options[0].id] })
		await ageOutbox()

		const mail = mailRecorder()
		await drainResolutionDigests({ send: mail.send })

		const [message] = mail.sent
		expect(message.headers?.["List-Unsubscribe-Post"]).toBe(
			"List-Unsubscribe=One-Click",
		)
		expect(message.headers?.["List-Unsubscribe"]).toContain(
			"/unsubscribe/one-click?token=",
		)
		expect(message.tags).toEqual([{ name: "type", value: "resolution_digest" }])
	})

	// The production failure, reproduced: startScheduler runs on every Fly
	// machine, so two drains hit the same ripe rows on the same tick and the
	// same person got the same digest twice. Both callers of this function now
	// go through DRAIN_DIGESTS_LOCK, which is what makes the second one a
	// no-op - the row bookkeeping inside the drain does not and cannot do it
	// on its own (see the claim's comment in email-digest.tsx).
	it("sends once when two machines drain the same rows at the same time", async () => {
		const { question, options } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})
		await resolve(question, { correctOptionIds: [options[0].id] })
		await ageOutbox()

		const mail = mailRecorder()
		const runs = await Promise.all([
			withJobLock(DRAIN_DIGESTS_LOCK, async () => {
				await drainResolutionDigests({ send: mail.send })
			}),
			withJobLock(DRAIN_DIGESTS_LOCK, async () => {
				await drainResolutionDigests({ send: mail.send })
			}),
		])

		expect(mail.sent).toHaveLength(1)
		// One machine ran it, the other skipped the tick rather than queueing.
		expect(runs.filter((r) => r.ran)).toHaveLength(1)
	})

	it("leaves a failed send pending and counts the attempt", async () => {
		const { question, options } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})
		await resolve(question, { correctOptionIds: [options[0].id] })
		await ageOutbox()

		const mail = mailRecorder({ ok: false, error: "resend exploded" })
		await drainResolutionDigests({ send: mail.send })

		const [row] = await db.select().from(emailOutbox)
		expect(row.sentAt).toBeNull()
		expect(row.attempts).toBe(1)
		expect(row.lastError).toBe("resend exploded")
	})

	it("gives up on a row that has failed too many times", async () => {
		const { question, options } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})
		await resolve(question, { correctOptionIds: [options[0].id] })
		await ageOutbox()
		await db.update(emailOutbox).set({ attempts: 5 })

		const mail = mailRecorder()
		await drainResolutionDigests({ send: mail.send })

		expect(mail.sent).toHaveLength(0)
	})

	it("does not re-send a batch that already went out", async () => {
		const { question, options } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})
		await resolve(question, { correctOptionIds: [options[0].id] })
		await ageOutbox()

		const first = mailRecorder()
		await drainResolutionDigests({ send: first.send })
		expect(first.sent).toHaveLength(1)

		const second = mailRecorder()
		await drainResolutionDigests({ send: second.send })
		expect(second.sent).toHaveLength(0)
	})
})

describe("drainResolutionDigests achievement lines", () => {
	it("adds a line for each sweep or streak event and marks it emailed", async () => {
		const { question, options, callers } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})
		const { user } = callers[0]
		await resolve(question, { correctOptionIds: [options[0].id] })
		await announceMilestone(user.id, question.leagueId)
		await ageOutbox()

		const mail = mailRecorder()
		await drainResolutionDigests({ send: mail.send })

		const league = await db.query.leagues.findFirst({
			where: { id: question.leagueId },
		})
		const [message] = mail.sent
		expect(message.text).toContain("5 in a row on NFL Player Stats.")
		expect(message.text).toContain(
			`/user/${user.username}/streaks/${league?.slug}/player_stats`,
		)
		expect(message.text).toContain(
			"utm_campaign=resolution_digest&utm_content=achievement",
		)
		expect(message.subject).not.toContain("in a row")
		const [notice] = await noticesFor(user.id)
		expect(notice?.emailedAt).not.toBeNull()
	})

	it("keeps the line for the next digest when the send fails", async () => {
		const { question, options, callers } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})
		await resolve(question, { correctOptionIds: [options[0].id] })
		await announceMilestone(callers[0].user.id, question.leagueId)
		await ageOutbox()

		await drainResolutionDigests({
			send: mailRecorder({ ok: false, error: "resend exploded" }).send,
		})

		const [notice] = await noticesFor(callers[0].user.id)
		expect(notice?.emailedAt).toBeNull()
	})

	it("sends nothing for an achievement with no results to go with it", async () => {
		const { question, callers } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})
		await announceMilestone(callers[0].user.id, question.leagueId)

		const mail = mailRecorder()
		await drainResolutionDigests({ send: mail.send })
		expect(mail.sent).toHaveLength(0)
	})
})

describe("resolveQuestionInternal enqueueing", () => {
	it("queues one row per scored caller", async () => {
		const { question, options, callers } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }, { optionIndex: 1 }],
		})
		await resolve(question, { correctOptionIds: [options[0].id] })

		const rows = await db.select().from(emailOutbox)
		expect(rows).toHaveLength(2)
		expect(rows.every((r) => r.type === "call_resolved")).toBe(true)
		expect(new Set(rows.map((r) => r.userId))).toEqual(
			new Set(callers.map((c) => c.user.id)),
		)
		expect(new Set(rows.map((r) => r.callId))).toEqual(
			new Set(callers.map((c) => c.call.id)),
		)
	})

	it("does not duplicate an unsent row when the same question re-resolves", async () => {
		const { question, options } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})
		await resolve(question, { correctOptionIds: [options[0].id] })
		// What overturnDispute does: re-run the scoring pass with the other
		// outcome while the first email is still queued.
		await resolve(question, { correctOptionIds: [options[1].id] })

		const rows = await db.select().from(emailOutbox)
		expect(rows).toHaveLength(1)
	})

	it("queues again once the first email has been sent, so a re-score is reported", async () => {
		const { question, options } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})
		await resolve(question, { correctOptionIds: [options[0].id] })
		await ageOutbox()
		await drainResolutionDigests({ send: mailRecorder().send })

		await resolve(question, { correctOptionIds: [options[1].id] })

		const rows = await db.select().from(emailOutbox)
		expect(rows).toHaveLength(2)
		const pending = rows.filter((r) => r.sentAt === null)
		expect(pending).toHaveLength(1)
	})

	it("deletes queued rows when the question goes away", async () => {
		const { question, options } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})
		await resolve(question, { correctOptionIds: [options[0].id] })
		expect(await db.select().from(emailOutbox)).toHaveLength(1)

		// voidQuestion hard-deletes the question; the cascade is what keeps the
		// drain from ever describing a question that no longer exists.
		await db.delete(questions).where(inArray(questions.id, [question.id]))
		expect(await db.select().from(emailOutbox)).toHaveLength(0)
	})
})
