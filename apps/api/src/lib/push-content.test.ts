import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "../db"
import { questions } from "../db/schema"
import {
	makeGroup,
	makeLeague,
	makeQuestion,
	makeUser,
} from "../test/factories"
import { createNotifications, type NotificationInput } from "./notifications"
import { buildPushContent } from "./push-content"

async function contentFor(input: NotificationInput) {
	const [{ id }] = await db.transaction((tx) =>
		createNotifications(tx, [input]),
	)
	const notification = await db.query.notifications.findFirst({
		where: { id },
	})
	if (!notification) throw new Error("notification missing")
	return buildPushContent(notification)
}

describe("buildPushContent", () => {
	it("tells a call on a question with no game, and opens the call", async () => {
		const user = await makeUser()
		const question = await makeQuestion({ title: "Will it snow" })

		expect(
			await contentFor({
				type: "call_resolved",
				userId: user.id,
				questionId: question.id,
				questionTitle: question.title,
				pointsDelta: -12,
				callId: null,
			}),
		).toEqual({
			title: "Your call missed",
			body: '"Will it snow". -12 pts.',
			path: `/questions/${question.id}/will-it-snow`,
		})
	})

	it("names who joined a group and opens the group", async () => {
		const admin = await makeUser()
		const joiner = await makeUser({ username: "newbie" })
		const group = await makeGroup({ admin, name: "Sunday Crew" })

		expect(
			await contentFor({
				type: "group_member_joined",
				userId: admin.id,
				groupId: group.id,
				groupName: group.name,
				actorId: joiner.id,
				actorUsername: joiner.username,
			}),
		).toEqual({
			title: "Sunday Crew",
			body: "@newbie joined",
			path: `/groups/${group.id}`,
		})
	})

	it("tells a streak in the same words as the in-app row", async () => {
		const user = await makeUser({ username: "hotstreak" })
		const league = await makeLeague({ slug: "nfl" })

		expect(
			await contentFor({
				type: "streak_milestone",
				userId: user.id,
				leagueId: league.id,
				streakFamily: "player_stats",
				achievementLabel: "NFL Player Stats",
				achievementCount: 5,
			}),
		).toEqual({
			title: "Streak",
			body: "5 in a row on NFL Player Stats.",
			path: "/user/hotstreak/streaks/nfl/player_stats/hot",
		})
	})

	it("opens the inbox for a voided question, which is deleted", async () => {
		const user = await makeUser()
		const question = await makeQuestion({ title: "Gone question" })
		const [{ id }] = await db.transaction((tx) =>
			createNotifications(tx, [
				{
					type: "question_voided",
					userId: user.id,
					questionId: question.id,
					questionTitle: question.title,
				},
			]),
		)
		await db.delete(questions).where(eq(questions.id, question.id))
		const notification = await db.query.notifications.findFirst({
			where: { id },
		})

		expect(notification && (await buildPushContent(notification))).toEqual({
			title: "Called My Shot",
			body: 'Your question "Gone question" was voided',
			path: "/notifications",
		})
	})
})
