import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "../../db"
import {
	type Game,
	games,
	presserOpenQueue,
	presserQuestions,
	pressers,
	type User,
} from "../../db/schema"
import {
	makeCall,
	makeGame,
	makeQuestion,
	makeSelection,
	makeUser,
	makeYesNoOptions,
	pastDate,
} from "../../test/factories"
import { resolve } from "../../test/helpers"
import { markQuestionVoided } from "../void-question"
import { ensureAppQuestions } from "./app-questions"
import { drainPresserOpens } from "./drain"

async function gameQuestion(game: Game) {
	const question = await makeQuestion({
		gameId: game.id,
		leagueId: game.leagueId,
		seasonId: game.seasonId,
		status: "locked",
		locksAt: pastDate(2),
	})
	const options = await makeYesNoOptions(question.id)
	return { question, ...options }
}

async function callYes(
	user: User,
	q: Awaited<ReturnType<typeof gameQuestion>>,
	conviction = 50,
) {
	const call = await makeCall(q.question.id, user.id)
	await makeSelection(call.id, q.yes.id, conviction)
	return call
}

const presserFor = (userId: string, gameId: string) =>
	db.query.pressers.findFirst({ where: { userId, gameId } })

describe("drainPresserOpens", () => {
	it("opens a presser once the game is final and every call settled", async () => {
		const game = await makeGame({ status: "final", startsAt: pastDate(4) })
		const user = await makeUser()
		const first = await gameQuestion(game)
		const second = await gameQuestion(game)
		await callYes(user, first)
		await callYes(user, second)

		await resolve(first.question, { correctOptionIds: [first.yes.id] })
		await drainPresserOpens()
		expect(await presserFor(user.id, game.id)).toBeUndefined()

		await resolve(second.question, { correctOptionIds: [second.no.id] })
		const { opened } = await drainPresserOpens()
		expect(opened).toBe(1)
		const presser = await presserFor(user.id, game.id)
		expect(presser?.appQuestionsGeneratedAt).toBeNull()
		expect(presser && presser.closesAt > presser.openedAt).toBe(true)

		const notice = await db.query.notifications.findFirst({
			where: { userId: user.id, type: "game_resolved" },
		})
		expect(notice?.readAt).toBeNull()
		const openedEvent = await db.query.analyticsOutbox.findFirst({
			where: { event: "presser_opened" },
		})
		expect(openedEvent).toMatchObject({
			userId: user.id,
			properties: {
				presserId: presser?.id,
				gameId: game.id,
				leagueId: game.leagueId,
				callCount: 2,
				ownerInAGroup: false,
			},
		})

		// A second run finds nothing to do.
		expect(await drainPresserOpens()).toEqual({ opened: 0, refreshed: 0 })
		expect(await db.select().from(pressers)).toHaveLength(1)
	})

	it("keeps waiting while the game isn't final", async () => {
		const game = await makeGame({ status: "live", startsAt: pastDate(1) })
		const user = await makeUser()
		const q = await gameQuestion(game)
		await callYes(user, q)
		await resolve(q.question, { correctOptionIds: [q.yes.id] })

		await drainPresserOpens()
		expect(await presserFor(user.id, game.id)).toBeUndefined()
		expect(await db.select().from(presserOpenQueue)).toHaveLength(1)

		await db.update(games).set({ status: "final" }).where(eq(games.id, game.id))
		await drainPresserOpens()
		expect(await presserFor(user.id, game.id)).toBeDefined()
	})

	it("opens nothing when every call on the game was voided", async () => {
		const game = await makeGame({ status: "final", startsAt: pastDate(4) })
		const user = await makeUser()
		const q = await gameQuestion(game)
		await callYes(user, q)
		await db.transaction((tx) =>
			markQuestionVoided(tx, q.question, {
				reason: "subject_did_not_play",
				note: "",
				voidedBy: { method: "system" },
			}),
		)
		await drainPresserOpens()
		expect(await presserFor(user.id, game.id)).toBeUndefined()
		expect(await db.select().from(presserOpenQueue)).toHaveLength(0)
	})

	it("withdraws a pending app question whose fact no longer holds, and keeps answered ones", async () => {
		const game = await makeGame({ status: "final", startsAt: pastDate(4) })
		const user = await makeUser()
		const q = await gameQuestion(game)
		const other = await gameQuestion(game)
		await callYes(user, q, 95)
		await callYes(user, other)
		// Missed with 95 conviction.
		await resolve(q.question, { correctOptionIds: [q.no.id] })
		await resolve(other.question, { correctOptionIds: [other.yes.id] })
		await drainPresserOpens()
		const presser = await presserFor(user.id, game.id)
		if (!presser) throw new Error("no presser")

		await ensureAppQuestions(presser)
		const before = await db.query.presserQuestions.findMany({
			where: { presserId: presser.id },
		})
		expect(before.map((row) => row.appTemplate).sort()).toEqual([
			"game_summary",
			"high_conviction_miss",
		])
		const summary = before.find((row) => row.appTemplate === "game_summary")
		await db
			.update(presserQuestions)
			.set({
				status: "answered",
				answerText: "Fine night",
				answeredAt: new Date(),
			})
			.where(eq(presserQuestions.id, summary?.id ?? ""))

		// The miss is overturned into a hit.
		const reloaded = await db.query.questions.findFirst({
			where: { id: q.question.id },
		})
		if (!reloaded) throw new Error("question gone")
		await resolve(reloaded, { correctOptionIds: [q.yes.id] })
		await drainPresserOpens()

		const after = await db.query.presserQuestions.findMany({
			where: { presserId: presser.id },
		})
		const byTemplate = new Map(after.map((row) => [row.appTemplate, row]))
		expect(byTemplate.get("high_conviction_miss")?.status).toBe("withdrawn")
		expect(byTemplate.get("game_summary")?.status).toBe("answered")
		expect(byTemplate.get("game_summary")?.body).toBe(summary?.body)
	})

	it("writes app questions on the owner's first look only, and none once closed", async () => {
		const game = await makeGame({ status: "final", startsAt: pastDate(4) })
		const user = await makeUser()
		const q = await gameQuestion(game)
		await callYes(user, q)
		await resolve(q.question, { correctOptionIds: [q.yes.id] })
		await drainPresserOpens()
		const presser = await presserFor(user.id, game.id)
		if (!presser) throw new Error("no presser")

		await ensureAppQuestions(presser)
		await ensureAppQuestions(presser)
		const rows = await db.query.presserQuestions.findMany({
			where: { presserId: presser.id },
		})
		expect(rows).toHaveLength(1)

		const closed = {
			...presser,
			appQuestionsGeneratedAt: null,
			closesAt: pastDate(1),
		}
		await db
			.update(pressers)
			.set({ appQuestionsGeneratedAt: null })
			.where(eq(pressers.id, presser.id))
		await db
			.delete(presserQuestions)
			.where(eq(presserQuestions.presserId, presser.id))
		await ensureAppQuestions(closed)
		expect(
			await db.query.presserQuestions.findMany({
				where: { presserId: presser.id },
			}),
		).toHaveLength(0)
	})

	it("gives no presser to someone with no call on the game", async () => {
		const game = await makeGame({ status: "final", startsAt: pastDate(4) })
		const caller = await makeUser()
		const bystander = await makeUser()
		const q = await gameQuestion(game)
		await callYes(caller, q)
		await resolve(q.question, { correctOptionIds: [q.yes.id] })
		await drainPresserOpens()
		expect(await presserFor(caller.id, game.id)).toBeDefined()
		expect(await presserFor(bystander.id, game.id)).toBeUndefined()
	})
})
