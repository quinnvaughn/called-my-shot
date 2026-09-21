import { describe, expect, it } from "vitest"
import { db } from "../../db"
import { notifications } from "../../db/schema"
import {
	makeGame,
	makeGroup,
	makeLeague,
	makeQuestion,
	makeUser,
} from "../../test/factories"
import { expectData } from "../../test/graphql"

// Each notification variant links back to whatever it's about. Those links
// resolve from the row's ids, and come back null once the target is gone.

const FEED = /* GraphQL */ `
	query Feed($first: Int, $after: String) {
		notifications(first: $first, after: $after) {
			... on QueryNotificationsSuccess {
				data {
					pageInfo { hasNextPage endCursor }
					items {
						__typename
						id
						... on QuestionSharedToGroupNotification {
							group { name }
							question { title }
							actor { username }
						}
						... on StreakMilestoneNotification {
							league { abbreviation }
						}
						... on GameReminderNotification {
							game { id }
						}
					}
				}
			}
		}
	}
`

type FeedItem = {
	__typename: string
	id: string
	group?: { name: string } | null
	question?: { title: string } | null
	actor?: { username: string } | null
	league?: { abbreviation: string } | null
	game?: { id: string } | null
}

type Feed = {
	notifications: {
		data: {
			pageInfo: { hasNextPage: boolean; endCursor: string | null }
			items: FeedItem[]
		}
	}
}

describe("notifications", () => {
	it("resolves each variant's links, newest first", async () => {
		const [viewer, actor] = await Promise.all([makeUser(), makeUser()])
		const league = await makeLeague()
		const game = await makeGame({ leagueId: league.id })
		const question = await makeQuestion({ leagueId: league.id })
		const group = await makeGroup({ admin: viewer, members: [actor] })

		await db.insert(notifications).values([
			{
				userId: viewer.id,
				type: "game_reminder",
				gameId: game.id,
				createdAt: new Date(Date.now() - 3000),
			},
			{
				userId: viewer.id,
				type: "streak_milestone",
				leagueId: league.id,
				createdAt: new Date(Date.now() - 2000),
			},
			{
				userId: viewer.id,
				type: "question_shared_to_group",
				groupId: group.id,
				questionId: question.id,
				actorId: actor.id,
				createdAt: new Date(Date.now() - 1000),
			},
		])

		const data = await expectData<Feed>(FEED, { as: viewer })
		const [shared, milestone, reminder] = data.notifications.data.items

		expect(shared).toMatchObject({
			__typename: "QuestionSharedToGroupNotification",
			group: { name: group.name },
			question: { title: question.title },
			actor: { username: actor.username },
		})
		expect(milestone).toMatchObject({
			__typename: "StreakMilestoneNotification",
			league: { abbreviation: league.abbreviation },
		})
		expect(reminder).toMatchObject({
			__typename: "GameReminderNotification",
			game: { id: game.id },
		})
	})

	it("resolves a link to null when its row has no id", async () => {
		const viewer = await makeUser()
		await db.insert(notifications).values({
			userId: viewer.id,
			type: "question_shared_to_group",
		})

		const data = await expectData<Feed>(FEED, { as: viewer })
		expect(data.notifications.data.items[0]).toMatchObject({
			group: null,
			question: null,
			actor: null,
		})
	})

	it("pages by cursor without repeating a row", async () => {
		const viewer = await makeUser()
		await db.insert(notifications).values(
			[1, 2, 3].map((n) => ({
				userId: viewer.id,
				type: "streak_milestone" as const,
				createdAt: new Date(Date.now() - n * 1000),
			})),
		)

		const first = await expectData<Feed>(FEED, {
			as: viewer,
			variables: { first: 2 },
		})
		expect(first.notifications.data.items).toHaveLength(2)
		expect(first.notifications.data.pageInfo.hasNextPage).toBe(true)

		const second = await expectData<Feed>(FEED, {
			as: viewer,
			variables: {
				first: 2,
				after: first.notifications.data.pageInfo.endCursor,
			},
		})
		expect(second.notifications.data.items).toHaveLength(1)
		expect(second.notifications.data.pageInfo.hasNextPage).toBe(false)
		const ids = [
			...first.notifications.data.items,
			...second.notifications.data.items,
		].map((item) => item.id)
		expect(new Set(ids).size).toBe(3)
	})
})
