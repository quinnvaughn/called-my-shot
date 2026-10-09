import { describe, expect, it } from "vitest"
import { db } from "../db"
import { ballotQuestions, ballots, groupPins } from "../db/schema"
import {
	makeGroup,
	makeLeague,
	makeQuestion,
	makeSeason,
	makeUser,
} from "../test/factories"
import { hoursAgo, hoursFromNow } from "../test/helpers"
import { expireGroupPins } from "./group-pins"

describe("expireGroupPins", () => {
	it("deletes pins that can't be called and tells admins when the last one goes", async () => {
		const [admin, member] = await Promise.all([makeUser(), makeUser()])
		const emptied = await makeGroup({ admin, members: [member] })
		const kept = await makeGroup({ admin })
		const locked = await makeQuestion({ locksAt: hoursAgo(1) })
		const voided = await makeQuestion({ status: "voided" })
		const open = await makeQuestion({ locksAt: hoursFromNow(24) })
		await db.insert(groupPins).values([
			{ groupId: emptied.id, questionId: locked.id, position: 0 },
			{ groupId: emptied.id, questionId: voided.id, position: 1 },
			{ groupId: kept.id, questionId: locked.id, position: 0 },
			{ groupId: kept.id, questionId: open.id, position: 1 },
		])

		expect(await expireGroupPins()).toBe(3)

		const left = await db.query.groupPins.findMany()
		expect(left).toMatchObject([{ groupId: kept.id, questionId: open.id }])
		const notices = await db.query.notifications.findMany({
			where: { type: "group_pins_expired" },
		})
		expect(notices).toMatchObject([
			{ userId: admin.id, groupId: emptied.id, groupName: emptied.name },
		])

		expect(await expireGroupPins()).toBe(0)
		expect(
			await db.query.notifications.findMany({
				where: { type: "group_pins_expired" },
			}),
		).toHaveLength(1)
	})

	it("deletes ballot pins once nothing on the ballot can be called", async () => {
		const admin = await makeUser()
		const group = await makeGroup({ admin })
		const league = await makeLeague()
		const season = await makeSeason({ leagueId: league.id })
		const ballotWith = async (slug: string, locksAt: Date[]) => {
			const [ballot] = await db
				.insert(ballots)
				.values({
					name: slug,
					slug,
					sportId: league.sportId,
					leagueId: league.id,
					seasonId: season.id,
					status: "published",
				})
				.returning()
			if (!ballot) throw new Error("ballot insert returned no row")
			for (const at of locksAt) {
				const question = await makeQuestion({
					leagueId: league.id,
					seasonId: season.id,
					locksAt: at,
				})
				await db.insert(ballotQuestions).values({
					ballotId: ballot.id,
					questionId: question.id,
					label: question.title,
				})
			}
			return ballot
		}
		const done = await ballotWith(`done-${season.id}`, [hoursAgo(1)])
		const partly = await ballotWith(`partly-${season.id}`, [
			hoursAgo(1),
			hoursFromNow(24),
		])
		await db.insert(groupPins).values([
			{ groupId: group.id, ballotId: done.id, position: 0 },
			{ groupId: group.id, ballotId: partly.id, position: 1 },
		])

		expect(await expireGroupPins()).toBe(1)
		expect(await db.query.groupPins.findMany()).toMatchObject([
			{ ballotId: partly.id },
		])
	})
})
