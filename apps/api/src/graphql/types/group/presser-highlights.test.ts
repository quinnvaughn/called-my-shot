import { describe, expect, it } from "vitest"
import { db } from "../../../db"
import { groupLeagues } from "../../../db/schema"
import {
	makeGame,
	makeGroup,
	makePresser,
	makePresserQuestion,
	makeUser,
} from "../../../test/factories"
import { expectData } from "../../../test/graphql"
import { hoursAgo } from "../../../test/helpers"

const HIGHLIGHTS = /* GraphQL */ `
	query Highlights($id: ID!) {
		group(id: $id) {
			presserHighlights {
				id
				latestAnswer { body answer }
			}
		}
	}
`

type Data = {
	group: {
		presserHighlights: {
			id: string
			latestAnswer: { body: string; answer: string | null }
		}[]
	}
}

const answered = (hours: number, body: string) => ({
	status: "answered" as const,
	answerText: `Answer to ${body}`,
	answeredAt: hoursAgo(hours),
	body,
})

describe("Group.presserHighlights", () => {
	it("lists members' fresh answers, one per presser, newest first", async () => {
		const admin = await makeUser()
		const member = await makeUser()
		const outsider = await makeUser()
		const group = await makeGroup({ admin, members: [member] })
		const game = await makeGame({ status: "final" })

		const mine = await makePresser({ userId: admin.id, gameId: game.id })
		const theirs = await makePresser({ userId: member.id, gameId: game.id })
		const stranger = await makePresser({ userId: outsider.id, gameId: game.id })

		await makePresserQuestion(mine.id, answered(5, "older"))
		await makePresserQuestion(mine.id, {
			...answered(1, "newer"),
			askerId: member.id,
		})
		await makePresserQuestion(theirs.id, answered(3, "member"))
		// Stale, pending and outside the group: none show.
		await makePresserQuestion(theirs.id, {
			...answered(40, "stale"),
			askerId: admin.id,
		})
		await makePresserQuestion(theirs.id, {
			body: "pending",
			askerId: outsider.id,
		})
		await makePresserQuestion(stranger.id, answered(1, "stranger"))

		const data = await expectData<Data>(HIGHLIGHTS, {
			as: admin,
			variables: { id: group.id },
		})
		expect(
			data.group.presserHighlights.map((h) => [h.id, h.latestAnswer.body]),
		).toEqual([
			[mine.id, "newer"],
			[theirs.id, "member"],
		])
	})

	it("keeps to the leagues the group tracks", async () => {
		const admin = await makeUser()
		const group = await makeGroup({ admin })
		const tracked = await makeGame({ status: "final" })
		const other = await makeGame({ status: "final" })
		await db
			.insert(groupLeagues)
			.values({ groupId: group.id, leagueId: tracked.leagueId })

		const inLeague = await makePresser({ userId: admin.id, gameId: tracked.id })
		const outOfLeague = await makePresser({
			userId: admin.id,
			gameId: other.id,
		})
		await makePresserQuestion(inLeague.id, answered(1, "in"))
		await makePresserQuestion(outOfLeague.id, answered(1, "out"))

		const data = await expectData<Data>(HIGHLIGHTS, {
			as: admin,
			variables: { id: group.id },
		})
		expect(data.group.presserHighlights.map((h) => h.id)).toEqual([inLeague.id])
	})
})
