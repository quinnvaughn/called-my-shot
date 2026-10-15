import { describe, expect, it } from "vitest"
import { db } from "../../../db"
import { callSelections, type User } from "../../../db/schema"
import {
	makeCall,
	makeGroup,
	makeLeague,
	makeQuestion,
	makeUser,
	makeYesNoOptions,
} from "../../../test/factories"
import { expectData } from "../../../test/graphql"
import { hoursFromNow } from "../../../test/helpers"

const STILL_OPEN = /* GraphQL */ `
	query StillOpen($groupId: ID!) {
		group(id: $groupId) {
			stillOpenQuestions {
				question { id }
				memberCount
				picks { optionId count }
				medianGuess
			}
		}
	}
`

type StillOpenData = {
	group: {
		stillOpenQuestions: {
			question: { id: string }
			memberCount: number
			picks: { optionId: string; count: number }[]
			medianGuess: number | null
		}[]
	}
}

async function setup() {
	const league = await makeLeague()
	const other = await makeLeague()
	const viewer = await makeUser()
	const members = [await makeUser(), await makeUser(), await makeUser()]
	const outsider = await makeUser()
	const group = await makeGroup({
		admin: viewer,
		members,
		leagueIds: [league.id],
	})
	return { league, other, viewer, members, outsider, group }
}

// A yes/no question locking at `locksAt` (or `hours` from now), called by
// each user on the side given.
async function yesNo(
	leagueId: string,
	locksAt: number | Date,
	picks: { user: User; yes: boolean }[],
) {
	const question = await makeQuestion({
		leagueId,
		locksAt: locksAt instanceof Date ? locksAt : hoursFromNow(locksAt),
	})
	const { yes, no } = await makeYesNoOptions(question.id)
	for (const pick of picks) {
		const call = await makeCall(question.id, pick.user.id)
		await db.insert(callSelections).values({
			callId: call.id,
			optionId: pick.yes ? yes.id : no.id,
			conviction: 70,
		})
	}
	return { question, yes, no }
}

describe("Group.stillOpenQuestions", () => {
	it("lists what the group called and the viewer hasn't, soonest lock first", async () => {
		const ctx = await setup()
		const [a, b, c] = ctx.members as [User, User, User]

		const later = await yesNo(ctx.league.id, 20, [
			{ user: a, yes: true },
			{ user: b, yes: false },
		])
		const sooner = await yesNo(ctx.league.id, 2, [
			{ user: a, yes: true },
			{ user: b, yes: true },
			{ user: c, yes: false },
		])
		// One member is a person, not a group read.
		await yesNo(ctx.league.id, 3, [{ user: a, yes: true }])
		// An outsider's call doesn't count toward the group.
		await yesNo(ctx.league.id, 3, [
			{ user: a, yes: true },
			{ user: ctx.outsider, yes: true },
		])
		// Already called by the viewer.
		await yesNo(ctx.league.id, 3, [
			{ user: a, yes: true },
			{ user: b, yes: true },
			{ user: ctx.viewer, yes: true },
		])
		// Outside the window, and outside the group's leagues.
		await yesNo(ctx.league.id, 72, [
			{ user: a, yes: true },
			{ user: b, yes: true },
		])
		await yesNo(ctx.other.id, 3, [
			{ user: a, yes: true },
			{ user: b, yes: true },
		])

		const data = await expectData<StillOpenData>(STILL_OPEN, {
			as: ctx.viewer,
			variables: { groupId: ctx.group.id },
		})

		expect(data.group.stillOpenQuestions).toEqual([
			{
				question: { id: sooner.question.id },
				memberCount: 3,
				picks: [
					{ optionId: sooner.yes.id, count: 2 },
					{ optionId: sooner.no.id, count: 1 },
				],
				medianGuess: null,
			},
			{
				question: { id: later.question.id },
				memberCount: 2,
				picks: expect.arrayContaining([
					{ optionId: later.yes.id, count: 1 },
					{ optionId: later.no.id, count: 1 },
				]),
				medianGuess: null,
			},
		])
	})

	it("puts the closer split first on the same lock", async () => {
		const ctx = await setup()
		const [a, b, c] = ctx.members as [User, User, User]
		const locksAt = hoursFromNow(5)

		// Same lock to the millisecond, so only the split orders them.
		const lopsided = await yesNo(ctx.league.id, locksAt, [
			{ user: a, yes: true },
			{ user: b, yes: true },
			{ user: c, yes: true },
		])
		const even = await yesNo(ctx.league.id, locksAt, [
			{ user: a, yes: true },
			{ user: b, yes: false },
		])

		const data = await expectData<StillOpenData>(STILL_OPEN, {
			as: ctx.viewer,
			variables: { groupId: ctx.group.id },
		})

		expect(data.group.stillOpenQuestions.map((e) => e.question.id)).toEqual([
			even.question.id,
			lopsided.question.id,
		])
	})

	it("gives the members' middle guess on a numeric question", async () => {
		const ctx = await setup()
		const [a, b, c] = ctx.members as [User, User, User]
		const question = await makeQuestion({
			leagueId: ctx.league.id,
			shape: "player_stat_numeric_guess",
			locksAt: hoursFromNow(4),
		})
		await makeCall(question.id, a.id, { guessValue: 250 })
		await makeCall(question.id, b.id, { guessValue: 300 })
		await makeCall(question.id, c.id, { guessValue: 280 })

		const data = await expectData<StillOpenData>(STILL_OPEN, {
			as: ctx.viewer,
			variables: { groupId: ctx.group.id },
		})

		expect(data.group.stillOpenQuestions).toEqual([
			{
				question: { id: question.id },
				memberCount: 3,
				picks: [],
				medianGuess: 280,
			},
		])
	})
})
