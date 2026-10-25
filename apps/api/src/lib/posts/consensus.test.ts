import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "../../db"
import { posts } from "../../db/schema"
import {
	makeGroup,
	makeLeague,
	makePlayer,
	makePrompt,
	makeRushmore,
	makeTeam,
	makeUser,
} from "../../test/factories"
import { consensusTop, promptConsensus, sharePercent } from "./consensus"

describe("promptConsensus", () => {
	it("counts each player's share of the public answers, most picked first", async () => {
		const league = await makeLeague()
		const team = await makeTeam({ leagueId: league.id })
		const prompt = await makePrompt({ leagueId: league.id, teamId: team.id })
		const [a, b, c, d, e] = await Promise.all(
			Array.from({ length: 5 }, () => makePlayer()),
		)
		if (!a || !b || !c || !d || !e) throw new Error("players missing")

		await makeRushmore({
			author: await makeUser(),
			prompt,
			playerIds: [a.id, b.id, c.id, d.id],
		})
		await makeRushmore({
			author: await makeUser(),
			prompt,
			playerIds: [a.id, b.id, c.id, e.id],
		})
		await makeRushmore({
			author: await makeUser(),
			prompt,
			playerIds: [a.id, b.id, e.id, d.id],
		})
		const removed = await makeRushmore({
			author: await makeUser(),
			prompt,
			playerIds: [e.id, d.id, c.id, b.id],
		})
		await db
			.update(posts)
			.set({ removedAt: new Date() })
			.where(eq(posts.id, removed.id))
		// A group's answer stays in the group and doesn't count.
		const member = await makeUser()
		const group = await makeGroup({ admin: member })
		await makeRushmore({
			author: member,
			prompt,
			groupId: group.id,
			playerIds: [e.id, d.id, c.id, b.id],
		})

		const consensus = (await promptConsensus([prompt.id])).get(prompt.id)
		if (!consensus) throw new Error("no consensus")
		expect(consensus.answerCount).toBe(3)
		const byPlayer = new Map(consensus.picks.map((p) => [p.playerId, p]))
		expect(byPlayer.get(a.id)?.count).toBe(3)
		expect(sharePercent(byPlayer.get(c.id)?.share ?? 0)).toBe(67)
		expect(consensusTop(consensus).map((p) => p.playerId)).toEqual([
			a.id,
			b.id,
			c.id,
			d.id,
		])
	})

	it("is empty for a prompt nobody has answered", async () => {
		const league = await makeLeague()
		const prompt = await makePrompt({ leagueId: league.id })
		expect((await promptConsensus([prompt.id])).get(prompt.id)).toEqual({
			answerCount: 0,
			picks: [],
		})
	})
})
