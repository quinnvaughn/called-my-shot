import { describe, expect, it } from "vitest"
import { db } from "../db"
import { ballotQuestions, ballots, callSelections } from "../db/schema"
import {
	futureDate,
	makeCall,
	makeLeague,
	makeOption,
	makeQuestion,
	makeSeason,
	makeSelection,
	makeUser,
	pastDate,
} from "../test/factories"
import { expectData } from "../test/graphql"

const ENTRY = /* GraphQL */ `
	query Entry($ref: ID!, $username: String!) {
		ballot(id: $ref) {
			entry(username: $username) {
				calledCount
				wins
				losses
				points
				user { username }
				members {
					member { id label }
					call { id selections { id } }
				}
			}
		}
	}
`

type EntryData = {
	ballot: {
		entry: {
			calledCount: number
			wins: number
			losses: number
			points: number
			user: { username: string }
			members: {
				member: { id: string; label: string }
				call: {
					id: string
					selections: { id: string }[]
				} | null
			}[]
		} | null
	}
}

type MemberSpec = { status: "open" | "resolved" }

// A published ballot of yes/no questions. On a resolved member "Yes" is the
// correct option.
async function seedBallot(specs: MemberSpec[]) {
	const league = await makeLeague()
	const season = await makeSeason({ leagueId: league.id })
	const [ballot] = await db
		.insert(ballots)
		.values({
			name: "Major Awards",
			slug: `major-awards-${league.slug}`,
			sportId: league.sportId,
			leagueId: league.id,
			seasonId: season.id,
			status: "published",
			publishedAt: new Date(),
		})
		.returning()
	if (!ballot) throw new Error("ballot insert returned no row")

	const members = []
	for (const [index, spec] of specs.entries()) {
		const resolved = spec.status === "resolved"
		const question = await makeQuestion({
			leagueId: league.id,
			seasonId: season.id,
			status: spec.status,
			locksAt: resolved ? pastDate(24) : futureDate(24),
		})
		const yes = await makeOption(question.id, {
			label: "Yes",
			sortOrder: 0,
			...(resolved ? { isCorrect: true } : {}),
		})
		const no = await makeOption(question.id, {
			label: "No",
			sortOrder: 1,
			...(resolved ? { isCorrect: false } : {}),
		})
		await db.insert(ballotQuestions).values({
			ballotId: ballot.id,
			questionId: question.id,
			label: `Member ${index}`,
			sortOrder: index,
		})
		members.push({ question, yes, no })
	}
	return { ballot, members }
}

describe("Ballot.entry", () => {
	it("pairs every member with the user's call, null where they didn't call", async () => {
		const { ballot, members } = await seedBallot([
			{ status: "open" },
			{ status: "open" },
			{ status: "open" },
		])
		const user = await makeUser()
		const first = await makeCall(members[0].question.id, user.id)
		await makeSelection(first.id, members[0].yes.id)
		const third = await makeCall(members[2].question.id, user.id)
		await makeSelection(third.id, members[2].no.id)

		const data = await expectData<EntryData>(ENTRY, {
			variables: { ref: ballot.slug, username: user.username },
			as: user,
		})

		const entry = data.ballot.entry
		expect(entry?.calledCount).toBe(2)
		expect(entry?.user.username).toBe(user.username)
		expect(entry?.members.map((m) => m.member.label)).toEqual([
			"Member 0",
			"Member 1",
			"Member 2",
		])
		expect(entry?.members.map((m) => m.call?.id ?? null)).toEqual([
			first.id,
			null,
			third.id,
		])
	})

	it("counts the record and points off settled members only", async () => {
		const { ballot, members } = await seedBallot([
			{ status: "resolved" },
			{ status: "resolved" },
			{ status: "open" },
		])
		const user = await makeUser()

		const won = await makeCall(members[0].question.id, user.id)
		await db.insert(callSelections).values({
			callId: won.id,
			optionId: members[0].yes.id,
			conviction: 100,
			resultPoints: 100,
		})
		const lost = await makeCall(members[1].question.id, user.id)
		await db.insert(callSelections).values({
			callId: lost.id,
			optionId: members[1].no.id,
			conviction: 100,
			resultPoints: -40,
		})
		const pending = await makeCall(members[2].question.id, user.id)
		await makeSelection(pending.id, members[2].yes.id)

		const data = await expectData<EntryData>(ENTRY, {
			variables: { ref: ballot.slug, username: user.username },
		})

		expect(data.ballot.entry).toMatchObject({
			calledCount: 3,
			wins: 1,
			losses: 1,
			points: 60,
		})
	})

	it("is null for someone with no calls on the ballot, or no such user", async () => {
		const { ballot, members } = await seedBallot([{ status: "open" }])
		const caller = await makeUser()
		const call = await makeCall(members[0].question.id, caller.id)
		await makeSelection(call.id, members[0].yes.id)
		const bystander = await makeUser()

		for (const username of [bystander.username, "nobody-by-this-name"]) {
			const data = await expectData<EntryData>(ENTRY, {
				variables: { ref: ballot.slug, username },
			})
			expect(data.ballot.entry).toBeNull()
		}
	})

	it("shows picks on still-open questions to someone signed out", async () => {
		const { ballot, members } = await seedBallot([{ status: "open" }])
		const owner = await makeUser()
		const call = await makeCall(members[0].question.id, owner.id)
		await makeSelection(call.id, members[0].yes.id)

		const data = await expectData<EntryData>(ENTRY, {
			variables: { ref: ballot.slug, username: owner.username },
		})
		expect(data.ballot.entry?.members[0].call?.selections).toHaveLength(1)
	})
})
