import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "../../db"
import { follows, postLikes, posts, prompts, userBlocks } from "../../db/schema"
import {
	makeGroup,
	makeLeague,
	makePlayer,
	makePrompt,
	makeRushmore,
	makeTeam,
	makeUser,
} from "../../test/factories"
import {
	groupFeed,
	homeFeed,
	promptAnswers,
	spaceFeed,
	userFeed,
} from "./feeds"

async function scene() {
	const league = await makeLeague()
	const otherLeague = await makeLeague()
	const team = await makeTeam({ leagueId: league.id })
	const prompt = await makePrompt({ leagueId: league.id, teamId: team.id })
	const otherPrompt = await makePrompt({ leagueId: otherLeague.id })
	const players = await Promise.all(
		Array.from({ length: 4 }, () => makePlayer()),
	)
	const playerIds = players.map((player) => player.id)
	return { league, otherLeague, team, prompt, otherPrompt, playerIds }
}

const ids = (page: { items: { id: string }[] }) =>
	page.items.map((item) => item.id)

const follow = (
	followerId: string,
	targetKind: "user" | "league" | "team" | "player",
	targetId: string,
) => db.insert(follows).values({ followerId, targetKind, targetId })

describe("homeFeed", () => {
	it("is followed spaces, followed people, my groups and my own posts", async () => {
		const s = await scene()
		const viewer = await makeUser()
		const friend = await makeUser()
		const stranger = await makeUser()
		const groupmate = await makeUser()
		const group = await makeGroup({ admin: viewer, members: [groupmate] })
		const otherGroup = await makeGroup({ admin: stranger })

		await follow(viewer.id, "league", s.league.id)
		await follow(viewer.id, "user", friend.id)

		const inFollowedLeague = await makeRushmore({
			author: stranger,
			prompt: s.prompt,
			playerIds: s.playerIds,
		})
		const byFriendElsewhere = await makeRushmore({
			author: friend,
			prompt: s.otherPrompt,
			playerIds: s.playerIds,
		})
		const inUnfollowedLeague = await makeRushmore({
			author: stranger,
			prompt: s.otherPrompt,
			playerIds: s.playerIds,
		})
		const inMyGroup = await makeRushmore({
			author: groupmate,
			prompt: s.otherPrompt,
			groupId: group.id,
			playerIds: s.playerIds,
		})
		const inSomeoneElsesGroup = await makeRushmore({
			author: stranger,
			prompt: s.prompt,
			groupId: otherGroup.id,
			playerIds: s.playerIds,
		})
		const mine = await makeRushmore({
			author: viewer,
			prompt: s.otherPrompt,
			playerIds: s.playerIds,
		})

		const feed = ids(await homeFeed(viewer.id, {}))
		expect(feed).toEqual(
			expect.arrayContaining([
				inFollowedLeague.id,
				byFriendElsewhere.id,
				inMyGroup.id,
				mine.id,
			]),
		)
		expect(feed).not.toContain(inUnfollowedLeague.id)
		expect(feed).not.toContain(inSomeoneElsesGroup.id)
	})

	it("follows a player's mentions and a team's subject posts", async () => {
		const s = await scene()
		const viewer = await makeUser()
		const [picked] = s.playerIds
		if (!picked) throw new Error("no players")
		await follow(viewer.id, "player", picked)
		const post = await makeRushmore({
			author: await makeUser(),
			prompt: s.otherPrompt,
			playerIds: s.playerIds,
		})
		expect(ids(await homeFeed(viewer.id, {}))).toEqual([post.id])
	})

	it("leaves out blocked authors either way, removed posts and removed prompts", async () => {
		const s = await scene()
		const viewer = await makeUser()
		await follow(viewer.id, "league", s.league.id)
		const blocked = await makeUser()
		const blocker = await makeUser()
		await db.insert(userBlocks).values([
			{ blockerId: viewer.id, blockedId: blocked.id },
			{ blockerId: blocker.id, blockedId: viewer.id },
		])
		await makeRushmore({
			author: blocked,
			prompt: s.prompt,
			playerIds: s.playerIds,
		})
		await makeRushmore({
			author: blocker,
			prompt: s.prompt,
			playerIds: s.playerIds,
		})
		const removed = await makeRushmore({
			author: await makeUser(),
			prompt: s.prompt,
			playerIds: s.playerIds,
		})
		await db
			.update(posts)
			.set({ removedAt: new Date() })
			.where(eq(posts.id, removed.id))
		const kept = await makeRushmore({
			author: await makeUser(),
			prompt: s.prompt,
			playerIds: s.playerIds,
		})
		expect(ids(await homeFeed(viewer.id, {}))).toEqual([kept.id])

		await db
			.update(prompts)
			.set({ removedAt: new Date() })
			.where(eq(prompts.id, s.prompt.id))
		expect(ids(await homeFeed(viewer.id, {}))).toEqual([])
	})

	it("pages newest first without repeats", async () => {
		const s = await scene()
		const viewer = await makeUser()
		const made = []
		for (let i = 0; i < 5; i++) {
			made.push(
				await makeRushmore({
					author: await makeUser(),
					prompt: s.prompt,
					playerIds: s.playerIds,
					createdAt: new Date(Date.UTC(2026, 0, 1 + i)),
				}),
			)
		}
		await follow(viewer.id, "team", s.team.id)
		const first = await homeFeed(viewer.id, { first: 2 })
		expect(first.pageInfo.hasNextPage).toBe(true)
		const second = await homeFeed(viewer.id, {
			first: 10,
			after: first.pageInfo.endCursor,
		})
		expect([...ids(first), ...ids(second)]).toEqual(
			made.map((post) => post.id).reverse(),
		)
	})
})

describe("spaceFeed, userFeed and groupFeed", () => {
	it("keeps group posts out of spaces and profiles", async () => {
		const s = await scene()
		const author = await makeUser()
		const group = await makeGroup({ admin: author })
		const publicPost = await makeRushmore({
			author,
			prompt: s.prompt,
			playerIds: s.playerIds,
		})
		const groupPost = await makeRushmore({
			author,
			prompt: s.prompt,
			groupId: group.id,
			playerIds: s.playerIds,
		})
		const [picked] = s.playerIds
		if (!picked) throw new Error("no players")

		for (const page of await Promise.all([
			spaceFeed(null, "team", s.team.id, {}),
			spaceFeed(null, "league", s.league.id, {}),
			spaceFeed(null, "player", picked, {}),
			userFeed(null, author.id, {}),
		])) {
			expect(ids(page)).toEqual([publicPost.id])
		}
		expect(ids(await groupFeed(author.id, group.id, {}))).toEqual([
			groupPost.id,
		])
	})

	it("hides a profile's posts from someone blocked", async () => {
		const s = await scene()
		const author = await makeUser()
		const viewer = await makeUser()
		await makeRushmore({ author, prompt: s.prompt, playerIds: s.playerIds })
		await db
			.insert(userBlocks)
			.values({ blockerId: author.id, blockedId: viewer.id })
		expect(ids(await userFeed(viewer.id, author.id, {}))).toEqual([])
		expect(ids(await spaceFeed(viewer.id, "team", s.team.id, {}))).toEqual([])
	})
})

describe("promptAnswers", () => {
	it("sorts Top by likes and Newest by time, public answers only", async () => {
		const s = await scene()
		const older = await makeRushmore({
			author: await makeUser(),
			prompt: s.prompt,
			playerIds: s.playerIds,
			createdAt: new Date(Date.UTC(2026, 0, 1)),
		})
		const newer = await makeRushmore({
			author: await makeUser(),
			prompt: s.prompt,
			playerIds: s.playerIds,
			createdAt: new Date(Date.UTC(2026, 0, 2)),
		})
		const member = await makeUser()
		const group = await makeGroup({ admin: member })
		await makeRushmore({
			author: member,
			prompt: s.prompt,
			groupId: group.id,
			playerIds: s.playerIds,
		})
		const fans = await Promise.all([makeUser(), makeUser()])
		await db
			.insert(postLikes)
			.values(fans.map((fan) => ({ postId: older.id, userId: fan.id })))

		expect(ids(await promptAnswers(null, s.prompt.id, "top", {}))).toEqual([
			older.id,
			newer.id,
		])
		expect(ids(await promptAnswers(null, s.prompt.id, "newest", {}))).toEqual([
			newer.id,
			older.id,
		])
		const page = await promptAnswers(null, s.prompt.id, "top", { first: 1 })
		expect(ids(page)).toEqual([older.id])
		expect(
			ids(
				await promptAnswers(null, s.prompt.id, "top", {
					after: page.pageInfo.endCursor,
				}),
			),
		).toEqual([newer.id])
	})
})
