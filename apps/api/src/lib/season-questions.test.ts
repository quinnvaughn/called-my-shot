import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "../db"
import { type Player, questionOptions } from "../db/schema"
import {
	makeCall,
	makeOption,
	makePlayer,
	makeQuestion,
	makeSelection,
	makeUser,
} from "../test/factories"
import { reconcileAwardOptions } from "./season-questions"

const optionsFor = (questionId: string) =>
	db.query.questionOptions.findMany({
		where: { questionId },
		orderBy: { sortOrder: "asc" },
	})

async function awardQuestion(overrides = {}) {
	return makeQuestion({
		shape: "player_season_award",
		awardName: "Rookie of the Year",
		awardVerb: "win",
		picksRequired: 1,
		awardRookieOnly: true,
		...overrides,
	})
}

describe("reconcileAwardOptions", () => {
	it("adds a player who joined the pool after the question was generated", async () => {
		const question = await awardQuestion()
		const alreadyIn = await makePlayer()
		await makeOption(question.id, {
			label: alreadyIn.name,
			playerId: alreadyIn.id,
			sortOrder: 0,
		})
		const calledUp = await makePlayer({ name: "September Call-Up" })

		await reconcileAwardOptions(question, [alreadyIn, calledUp] as Player[])

		const options = await optionsFor(question.id)
		expect(options.map((o) => o.label)).toEqual([
			alreadyIn.name,
			"September Call-Up",
		])
		// Appended rather than renumbered - an existing caller's list must not
		// reshuffle under them mid-season.
		expect(options.map((o) => o.sortOrder)).toEqual([0, 1])
	})

	it("drops an option nobody called once its player leaves the pool", async () => {
		const question = await awardQuestion()
		const staying = await makePlayer()
		const leaving = await makePlayer()
		await makeOption(question.id, {
			label: staying.name,
			playerId: staying.id,
			sortOrder: 0,
		})
		await makeOption(question.id, {
			label: leaving.name,
			playerId: leaving.id,
			sortOrder: 1,
		})

		await reconcileAwardOptions(question, [staying] as Player[])

		const options = await optionsFor(question.id)
		expect(options.map((o) => o.playerId)).toEqual([staying.id])
	})

	it("keeps an option that has already been called, pool or no pool", async () => {
		const question = await awardQuestion()
		const leaving = await makePlayer()
		const option = await makeOption(question.id, {
			label: leaving.name,
			playerId: leaving.id,
			sortOrder: 0,
		})
		const user = await makeUser()
		const call = await makeCall(question.id, user.id)
		await makeSelection(call.id, option.id)

		await reconcileAwardOptions(question, [] as Player[])

		const options = await optionsFor(question.id)
		expect(options.map((o) => o.id)).toEqual([option.id])
	})

	it("leaves a locked question's option set alone", async () => {
		const question = await awardQuestion({ status: "locked" })
		const stale = await makePlayer()
		await makeOption(question.id, {
			label: stale.name,
			playerId: stale.id,
			sortOrder: 0,
		})
		const missing = await makePlayer()

		await reconcileAwardOptions(question, [missing] as Player[])

		const options = await optionsFor(question.id)
		expect(options.map((o) => o.playerId)).toEqual([stale.id])
	})

	it("does not touch a hand-built option that carries no player", async () => {
		const question = await awardQuestion()
		const freeform = await makeOption(question.id, {
			label: "Field",
			sortOrder: 0,
		})

		await reconcileAwardOptions(question, [] as Player[])

		const remaining = await db
			.select()
			.from(questionOptions)
			.where(eq(questionOptions.id, freeform.id))
		expect(remaining).toHaveLength(1)
	})
})
