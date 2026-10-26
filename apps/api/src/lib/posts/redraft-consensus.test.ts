import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "../../db"
import { posts } from "../../db/schema"
import {
	makeGroup,
	makeLeague,
	makePlayer,
	makeRedraft,
	makeRedraftPrompt,
	makeUser,
} from "../../test/factories"
import { crowdRedraft, redraftConsensus, slotShare } from "./redraft-consensus"

async function setup() {
	const league = await makeLeague()
	const prompt = await makeRedraftPrompt(league.id, 2003)
	const players = []
	for (let i = 0; i < 5; i++) players.push(await makePlayer())
	const [a, b, c, d, e] = players
	if (!a || !b || !c || !d || !e) throw new Error("players missing")
	return { prompt, a, b, c, d, e }
}

describe("redraftConsensus", () => {
	it("counts each slot only against the answers long enough to reach it", async () => {
		const { prompt, a, b, c, d } = await setup()
		await makeRedraft({
			author: await makeUser(),
			prompt,
			playerIds: [a.id, b.id, c.id],
		})
		await makeRedraft({
			author: await makeUser(),
			prompt,
			playerIds: [a.id, c.id, b.id, d.id],
		})
		await makeRedraft({ author: await makeUser(), prompt, playerIds: [b.id] })

		const consensus = (await redraftConsensus([prompt.id])).get(prompt.id)
		expect(consensus?.answerCount).toBe(3)
		expect(slotShare(consensus, 1, a.id)).toBeCloseTo(2 / 3)
		expect(slotShare(consensus, 2, b.id)).toBeCloseTo(1 / 2)
		// Only the four-pick answer reaches slot 4.
		expect(consensus?.slots.get(4)).toMatchObject({ answers: 1 })
		expect(slotShare(consensus, 4, d.id)).toBe(1)
	})

	it("leaves out group answers and removed ones", async () => {
		const { prompt, a, b } = await setup()
		const author = await makeUser()
		const group = await makeGroup({ admin: author })
		await makeRedraft({
			author,
			prompt,
			groupId: group.id,
			playerIds: [a.id],
		})
		const removed = await makeRedraft({
			author: await makeUser(),
			prompt,
			playerIds: [a.id],
		})
		await db
			.update(posts)
			.set({ removedAt: new Date() })
			.where(eq(posts.id, removed.id))
		await makeRedraft({ author: await makeUser(), prompt, playerIds: [b.id] })

		const consensus = (await redraftConsensus([prompt.id])).get(prompt.id)
		expect(consensus?.answerCount).toBe(1)
		expect(slotShare(consensus, 1, b.id)).toBe(1)
		expect(slotShare(consensus, 1, a.id)).toBe(0)
	})
})

describe("crowdRedraft", () => {
	it("goes slot by slot from the top, never taking a player twice", async () => {
		const { prompt, a, b, c } = await setup()
		// Everyone has a first. At 2, b is put there most, but b went first in
		// one; c is next.
		await makeRedraft({
			author: await makeUser(),
			prompt,
			playerIds: [a.id, b.id],
		})
		await makeRedraft({
			author: await makeUser(),
			prompt,
			playerIds: [a.id, b.id],
		})
		await makeRedraft({
			author: await makeUser(),
			prompt,
			playerIds: [b.id, c.id],
		})
		const consensus = (await redraftConsensus([prompt.id])).get(prompt.id)
		if (!consensus) throw new Error("no consensus")
		expect(
			crowdRedraft(consensus, 3).map(({ slot, playerId }) => ({
				slot,
				playerId,
			})),
		).toEqual([
			{ slot: 1, playerId: a.id },
			{ slot: 2, playerId: b.id },
		])

		await makeRedraft({
			author: await makeUser(),
			prompt,
			playerIds: [b.id, a.id, c.id],
		})
		await makeRedraft({
			author: await makeUser(),
			prompt,
			playerIds: [b.id, a.id],
		})
		const next = (await redraftConsensus([prompt.id])).get(prompt.id)
		if (!next) throw new Error("no consensus")
		// b leads slot 1 now, so slot 2's top pick (b) is taken and a is next.
		expect(crowdRedraft(next, 3).map((pick) => pick.playerId)).toEqual([
			b.id,
			a.id,
			c.id,
		])
	})
})
