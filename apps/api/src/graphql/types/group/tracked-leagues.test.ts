import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import { db } from "../../../db"
import {
	groupLeagues,
	groupMembers,
	groups,
	questionShares,
	type User,
	userSeasonStats,
} from "../../../db/schema"
import { insertGroupInvite } from "../../../lib/groups"
import {
	makeCall,
	makeLeague,
	makeQuestion,
	makeSeason,
	makeUser,
} from "../../../test/factories"
import { type ErrorResult, expectData } from "../../../test/graphql"

// A group's tracked leagues bound what it ranks, shows, and accepts: the
// leaderboard (and the card's viewerRank built on it), the invite preview's
// top scorer, the three activity feeds, and shareQuestionToGroup. No tracked
// rows means every league.

const DAY_MS = 24 * 60 * 60 * 1000
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS)

async function makeGroup(
	admin: User,
	members: User[] = [],
	leagueIds: string[] = [],
) {
	const [group] = await db
		.insert(groups)
		.values({ name: "Test group", createdBy: admin.id })
		.returning()
	await db.insert(groupMembers).values([
		{ groupId: group.id, userId: admin.id, role: "admin" as const },
		...members.map((m) => ({
			groupId: group.id,
			userId: m.id,
			role: "member" as const,
		})),
	])
	if (leagueIds.length > 0) {
		await db
			.insert(groupLeagues)
			.values(leagueIds.map((leagueId) => ({ groupId: group.id, leagueId })))
	}
	return group
}

function scorePoints(
	userId: string,
	leagueId: string,
	seasonId: string,
	points: number,
) {
	return db.insert(userSeasonStats).values({
		userId,
		leagueId,
		seasonId,
		points,
		callCount: 1,
		resolvedCallCount: 1,
		correctCount: points > 0 ? 1 : 0,
	})
}

// makeSeason's default window is in progress, so each of these is its
// league's current season.
async function twoLeagues() {
	const nba = await makeLeague()
	const nfl = await makeLeague()
	const nbaSeason = await makeSeason({ leagueId: nba.id })
	const nflSeason = await makeSeason({ leagueId: nfl.id })
	return { nba, nfl, nbaSeason, nflSeason }
}

const BOARD = /* GraphQL */ `
	query Board($groupId: ID!, $leagueId: ID, $season: SeasonFilterInput) {
		group(id: $groupId) {
			viewerRank
			leaderboard(leagueId: $leagueId, season: $season) {
				items {
					totalPoints
					user { id }
				}
			}
		}
	}
`

type Board = {
	group: {
		viewerRank: number
		leaderboard: { items: { totalPoints: number; user: { id: string } }[] }
	}
}

const PREVIEW = /* GraphQL */ `
	query Preview($code: String!) {
		groupPreview(code: $code) {
			trackedLeagues { abbreviation }
			topScorer { username points }
		}
	}
`

type Preview = {
	groupPreview: {
		trackedLeagues: { abbreviation: string }[]
		topScorer: { username: string; points: number } | null
	}
}

const CREATE_GROUP = /* GraphQL */ `
	mutation CreateGroup($input: CreateGroupInput!) {
		createGroup(input: $input) {
			__typename
			... on GroupPayload { group { trackedLeagues { id } } }
			... on ValidationError { message }
		}
	}
`

const UPDATE_GROUP = /* GraphQL */ `
	mutation UpdateGroup($input: UpdateGroupInput!) {
		updateGroup(input: $input) {
			__typename
			... on GroupPayload { group { name trackedLeagues { id } } }
			... on AuthorizationError { message }
			... on ValidationError { message }
		}
	}
`

type UpdateResult =
	| {
			__typename: "GroupPayload"
			group: { name: string; trackedLeagues: { id: string }[] }
	  }
	| ErrorResult

type GroupResult =
	| { __typename: "GroupPayload"; group: { trackedLeagues: { id: string }[] } }
	| ErrorResult

const SHARE = /* GraphQL */ `
	mutation Share($groupId: ID!, $questionId: ID!) {
		shareQuestionToGroup(groupId: $groupId, questionId: $questionId) {
			__typename
			... on ValidationError { message }
		}
	}
`

const FEEDS = /* GraphQL */ `
	query Feeds($groupId: ID!) {
		group(id: $groupId) {
			answeredQuestions { items { id } }
			createdQuestions { items { id } }
			sharedQuestions { items { id } }
		}
	}
`

type Feeds = {
	group: {
		answeredQuestions: { items: { id: string }[] }
		createdQuestions: { items: { id: string }[] }
		sharedQuestions: { items: { id: string }[] }
	}
}

describe("group leaderboard", () => {
	it("ranks only tracked leagues on the All board and the card rank", async () => {
		const { nba, nfl, nbaSeason, nflSeason } = await twoLeagues()
		const admin = await makeUser()
		const member = await makeUser()
		const group = await makeGroup(admin, [member], [nba.id])
		await scorePoints(admin.id, nba.id, nbaSeason.id, 10)
		await scorePoints(member.id, nba.id, nbaSeason.id, 5)
		await scorePoints(member.id, nfl.id, nflSeason.id, 50)

		const data = await expectData<Board>(BOARD, {
			as: member,
			variables: { groupId: group.id, season: { scope: "ALL_TIME" } },
		})

		expect(data.group.leaderboard.items).toEqual([
			{ totalPoints: 10, user: { id: admin.id } },
			{ totalPoints: 5, user: { id: member.id } },
		])
		expect(data.group.viewerRank).toBe(2)
	})

	it("ranks the tracked set for a league tab the group doesn't track", async () => {
		const { nba, nfl, nbaSeason, nflSeason } = await twoLeagues()
		const admin = await makeUser()
		const group = await makeGroup(admin, [], [nba.id])
		await scorePoints(admin.id, nba.id, nbaSeason.id, 5)
		await scorePoints(admin.id, nfl.id, nflSeason.id, 50)

		const data = await expectData<Board>(BOARD, {
			as: admin,
			variables: {
				groupId: group.id,
				leagueId: nfl.id,
				season: { scope: "ALL_TIME" },
			},
		})

		expect(data.group.leaderboard.items[0].totalPoints).toBe(5)
	})

	it("ranks every league when the group tracks none", async () => {
		const { nba, nfl, nbaSeason, nflSeason } = await twoLeagues()
		const admin = await makeUser()
		const group = await makeGroup(admin)
		await scorePoints(admin.id, nba.id, nbaSeason.id, 5)
		await scorePoints(admin.id, nfl.id, nflSeason.id, 50)

		const data = await expectData<Board>(BOARD, {
			as: admin,
			variables: { groupId: group.id, season: { scope: "ALL_TIME" } },
		})

		expect(data.group.leaderboard.items[0].totalPoints).toBe(55)
	})
})

describe("invite preview top scorer", () => {
	it("is the current season's leader across tracked leagues", async () => {
		const { nba, nfl, nbaSeason, nflSeason } = await twoLeagues()
		const lastSeason = await makeSeason({
			leagueId: nba.id,
			regularSeasonStartsAt: daysAgo(400),
			regularSeasonEndsAt: daysAgo(300),
		})
		const admin = await makeUser()
		const member = await makeUser()
		const group = await makeGroup(admin, [member], [nba.id])
		await scorePoints(admin.id, nba.id, lastSeason.id, 100)
		await scorePoints(admin.id, nfl.id, nflSeason.id, 100)
		await scorePoints(member.id, nba.id, nbaSeason.id, 5)
		const invite = await insertGroupInvite(group.id, admin.id, null)

		const data = await expectData<Preview>(PREVIEW, {
			variables: { code: invite.code },
		})

		expect(data.groupPreview.trackedLeagues).toEqual([
			{ abbreviation: nba.abbreviation },
		])
		expect(data.groupPreview.topScorer).toEqual({
			username: member.username,
			points: 5,
		})
	})

	it("is null while nobody has points this season", async () => {
		const nba = await makeLeague()
		await makeSeason({ leagueId: nba.id })
		const lastSeason = await makeSeason({
			leagueId: nba.id,
			regularSeasonStartsAt: daysAgo(400),
			regularSeasonEndsAt: daysAgo(300),
		})
		const admin = await makeUser()
		const group = await makeGroup(admin, [], [nba.id])
		await scorePoints(admin.id, nba.id, lastSeason.id, 100)
		const invite = await insertGroupInvite(group.id, admin.id, null)

		const data = await expectData<Preview>(PREVIEW, {
			variables: { code: invite.code },
		})

		expect(data.groupPreview.topScorer).toBeNull()
	})
})

describe("setting tracked leagues", () => {
	it("stores the leagues picked at creation", async () => {
		const nba = await makeLeague()
		const user = await makeUser()

		const data = await expectData<{ createGroup: GroupResult }>(CREATE_GROUP, {
			as: user,
			variables: { input: { name: "Celtics Talk", leagueIds: [nba.id] } },
		})

		expect(data.createGroup).toEqual({
			__typename: "GroupPayload",
			group: { trackedLeagues: [{ id: nba.id }] },
		})
	})

	it("rejects a league that doesn't exist", async () => {
		const user = await makeUser()

		const data = await expectData<{ createGroup: GroupResult }>(CREATE_GROUP, {
			as: user,
			variables: { input: { name: "Celtics Talk", leagueIds: [randomUUID()] } },
		})

		expect(data.createGroup.__typename).toBe("ValidationError")
	})

	it("only lets an admin change group settings", async () => {
		const nba = await makeLeague()
		const admin = await makeUser()
		const member = await makeUser()
		const group = await makeGroup(admin, [member])

		const data = await expectData<{ updateGroup: UpdateResult }>(UPDATE_GROUP, {
			as: member,
			variables: {
				input: {
					groupId: group.id,
					name: "Mine now",
					description: "",
					leagueIds: [nba.id],
				},
			},
		})

		expect(data.updateGroup.__typename).toBe("AuthorizationError")
	})

	it("renames the group and replaces its leagues together", async () => {
		const { nba, nfl } = await twoLeagues()
		const admin = await makeUser()
		const group = await makeGroup(admin, [], [nba.id])

		const replaced = await expectData<{ updateGroup: UpdateResult }>(
			UPDATE_GROUP,
			{
				as: admin,
				variables: {
					input: {
						groupId: group.id,
						name: "Wolfpack",
						description: "",
						leagueIds: [nfl.id],
					},
				},
			},
		)
		expect(replaced.updateGroup).toEqual({
			__typename: "GroupPayload",
			group: { name: "Wolfpack", trackedLeagues: [{ id: nfl.id }] },
		})

		const cleared = await expectData<{ updateGroup: UpdateResult }>(
			UPDATE_GROUP,
			{
				as: admin,
				variables: {
					input: {
						groupId: group.id,
						name: "Wolfpack",
						description: "",
						leagueIds: [],
					},
				},
			},
		)
		expect(cleared.updateGroup).toEqual({
			__typename: "GroupPayload",
			group: { name: "Wolfpack", trackedLeagues: [] },
		})
	})

	it("changes nothing when the name is invalid", async () => {
		const { nba, nfl } = await twoLeagues()
		const admin = await makeUser()
		const group = await makeGroup(admin, [], [nba.id])

		const data = await expectData<{ updateGroup: UpdateResult }>(UPDATE_GROUP, {
			as: admin,
			variables: {
				input: {
					groupId: group.id,
					name: "A",
					description: "",
					leagueIds: [nfl.id],
				},
			},
		})

		expect(data.updateGroup.__typename).toBe("ValidationError")
		const stored = await db.query.groups.findFirst({
			where: { id: group.id },
			with: { trackedLeagues: true },
		})
		expect(stored?.name).toBe("Test group")
		expect(stored?.trackedLeagues.map((row) => row.leagueId)).toEqual([nba.id])
	})
})

describe("sharing and activity", () => {
	it("refuses a question from a league the group doesn't track", async () => {
		const { nba, nfl } = await twoLeagues()
		const admin = await makeUser()
		const group = await makeGroup(admin, [], [nba.id])
		const nflQuestion = await makeQuestion({ leagueId: nfl.id })
		const nbaQuestion = await makeQuestion({ leagueId: nba.id })

		const refused = await expectData<{ shareQuestionToGroup: ErrorResult }>(
			SHARE,
			{ as: admin, variables: { groupId: group.id, questionId: nflQuestion.id } },
		)
		expect(refused.shareQuestionToGroup).toEqual({
			__typename: "ValidationError",
			message: `Test group doesn't track ${nfl.abbreviation} questions.`,
		})

		const shared = await expectData<{ shareQuestionToGroup: ErrorResult }>(
			SHARE,
			{ as: admin, variables: { groupId: group.id, questionId: nbaQuestion.id } },
		)
		expect(shared.shareQuestionToGroup.__typename).toBe("QuestionSharePayload")
	})

	it("keeps untracked leagues out of all three feeds", async () => {
		const { nba, nfl } = await twoLeagues()
		const admin = await makeUser()
		const member = await makeUser()
		const group = await makeGroup(admin, [member], [nba.id])
		const nbaQuestion = await makeQuestion({
			leagueId: nba.id,
			creatorId: member.id,
		})
		const nflQuestion = await makeQuestion({
			leagueId: nfl.id,
			creatorId: member.id,
		})
		const nbaCall = await makeCall(nbaQuestion.id, member.id)
		await makeCall(nflQuestion.id, member.id)
		const [nbaShare] = await db
			.insert(questionShares)
			.values([
				{ groupId: group.id, questionId: nbaQuestion.id, sharedBy: member.id },
				{ groupId: group.id, questionId: nflQuestion.id, sharedBy: member.id },
			])
			.returning()

		const data = await expectData<Feeds>(FEEDS, {
			as: admin,
			variables: { groupId: group.id },
		})

		expect(data.group.answeredQuestions.items).toEqual([{ id: nbaCall.id }])
		expect(data.group.createdQuestions.items).toEqual([{ id: nbaQuestion.id }])
		expect(data.group.sharedQuestions.items).toEqual([{ id: nbaShare.id }])
	})
})
