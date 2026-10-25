import { describe, expect, it } from "vitest"
import { db } from "../../db"
import { chains, commentLikes, comments, userBlocks } from "../../db/schema"
import {
	makeGroup,
	makeLeague,
	makePlayer,
	makePrompt,
	makeRushmore,
	makeTeam,
	makeUser,
} from "../../test/factories"
import { sendChainComment } from "../chains/comment"
import { NotFoundError, ValidationError } from "../errors"
import { sendPostComment } from "./comment"
import {
	firstReplies,
	repliesTo,
	replyCounts,
	topLevelComment,
	topLevelComments,
} from "./comment-thread"

async function scene() {
	const league = await makeLeague()
	const team = await makeTeam({ leagueId: league.id })
	const prompt = await makePrompt({ leagueId: league.id, teamId: team.id })
	const players = await Promise.all(
		Array.from({ length: 4 }, () => makePlayer()),
	)
	const author = await makeUser()
	const post = await makeRushmore({
		author,
		prompt,
		playerIds: players.map((player) => player.id),
	})
	return { league, team, prompt, players, author, post }
}

const say = (text: string) => ({ text })

describe("sendPostComment", () => {
	it("keeps replies on the second level, naming who a reply to a reply answers", async () => {
		const { post } = await scene()
		const [amy, ben, cal] = await Promise.all([
			makeUser(),
			makeUser(),
			makeUser(),
		])
		const top = await sendPostComment(amy, post.id, say("Russell over Bird"))
		const reply = await sendPostComment(ben, post.id, {
			...say("No chance"),
			parentId: top.id,
		})
		const answer = await sendPostComment(cal, post.id, {
			...say("Ben's right"),
			parentId: top.id,
			replyToUserId: ben.id,
		})
		expect(reply.parentId).toBe(top.id)
		expect(answer.parentId).toBe(top.id)
		expect(answer.replyToUserId).toBe(ben.id)

		// Replying to a reply by pointing at the reply itself is refused: the
		// parent is always the top-level comment.
		await expect(
			sendPostComment(amy, post.id, { ...say("Hm"), parentId: reply.id }),
		).rejects.toThrow("You can only reply to a comment on this post.")
	})

	it("refuses a parent on another post and an @mention from outside the thread", async () => {
		const first = await scene()
		const second = await scene()
		const amy = await makeUser()
		const elsewhere = await sendPostComment(amy, second.post.id, say("Hi"))
		await expect(
			sendPostComment(amy, first.post.id, {
				...say("Hi"),
				parentId: elsewhere.id,
			}),
		).rejects.toBeInstanceOf(ValidationError)

		const top = await sendPostComment(amy, first.post.id, say("Top"))
		const outsider = await makeUser()
		await expect(
			sendPostComment(amy, first.post.id, {
				...say("@you"),
				parentId: top.id,
				replyToUserId: outsider.id,
			}),
		).rejects.toThrow("You can only answer someone in this thread.")
	})

	it("lets only members comment on a group's post", async () => {
		const { prompt, players } = await scene()
		const member = await makeUser()
		const group = await makeGroup({ admin: member })
		const post = await makeRushmore({
			author: member,
			prompt,
			groupId: group.id,
			playerIds: players.map((player) => player.id),
		})
		await expect(
			sendPostComment(await makeUser(), post.id, say("Let me in")),
		).rejects.toBeInstanceOf(NotFoundError)
		await expect(
			sendPostComment(member, post.id, say("Ours")),
		).resolves.toBeTruthy()
	})

	it("tells the post's author about a comment and the parent's author about a reply", async () => {
		const { post, author } = await scene()
		const [amy, ben, cal] = await Promise.all([
			makeUser(),
			makeUser(),
			makeUser(),
		])
		const top = await sendPostComment(amy, post.id, say("First"))
		await sendPostComment(amy, post.id, say("Second"))
		await sendPostComment(ben, post.id, { ...say("Reply"), parentId: top.id })
		await sendPostComment(cal, post.id, {
			...say("@ben"),
			parentId: top.id,
			replyToUserId: ben.id,
		})

		const toAuthor = await db.query.notifications.findMany({
			where: { userId: author.id },
		})
		expect(toAuthor.map((n) => n.type)).toEqual(["post_commented"])
		expect(toAuthor[0]?.postId).toBe(post.id)

		const toAmy = await db.query.notifications.findMany({
			where: { userId: amy.id },
		})
		expect(toAmy.map((n) => n.type)).toEqual(["comment_replied"])
		expect(toAmy[0]?.commentId).toBe(top.id)

		const toBen = await db.query.notifications.findMany({
			where: { userId: ben.id },
		})
		expect(toBen.map((n) => n.type)).toEqual(["comment_replied"])
	})
})

describe("reading the thread", () => {
	it("orders Top by likes then newest, and Newest by time", async () => {
		const { post } = await scene()
		const amy = await makeUser()
		const quiet = await sendPostComment(amy, post.id, say("Quiet"))
		const loved = await sendPostComment(amy, post.id, say("Loved"))
		const latest = await sendPostComment(amy, post.id, say("Latest"))
		const fans = await Promise.all([makeUser(), makeUser()])
		await db
			.insert(commentLikes)
			.values(fans.map((fan) => ({ commentId: loved.id, userId: fan.id })))
		await db
			.insert(commentLikes)
			.values({ commentId: quiet.id, userId: amy.id })

		const top = await topLevelComments(null, post.id, { sort: "top" })
		expect(top.items.map((c) => c.id)).toEqual([loved.id, quiet.id, latest.id])
		const newest = await topLevelComments(null, post.id, { sort: "newest" })
		expect(newest.items.map((c) => c.id)).toEqual([
			latest.id,
			loved.id,
			quiet.id,
		])
	})

	it("leaves replies out of the top level", async () => {
		const { post } = await scene()
		const amy = await makeUser()
		const first = await sendPostComment(amy, post.id, say("Bird"))
		await sendPostComment(amy, post.id, say("Russell"))
		await sendPostComment(amy, post.id, {
			...say("Reply"),
			parentId: first.id,
		})

		const all = await topLevelComments(null, post.id, { sort: "newest" })
		expect(all.items).toHaveLength(2)
	})

	it("shows replies oldest first, a few inline and the rest paged", async () => {
		const { post } = await scene()
		const amy = await makeUser()
		const top = await sendPostComment(amy, post.id, say("Top"))
		const replies = []
		for (let i = 0; i < 4; i++) {
			replies.push(
				await sendPostComment(amy, post.id, {
					...say(`Reply ${i}`),
					parentId: top.id,
				}),
			)
		}
		const inline = (await firstReplies(null, [top.id], 2)).get(top.id) ?? []
		expect(inline.map((c) => c.id)).toEqual(
			replies.slice(0, 2).map((c) => c.id),
		)
		expect((await replyCounts(null, [top.id])).get(top.id)).toBe(4)

		const rest = await repliesTo(null, top.id, { first: 10 })
		expect(rest.items.map((c) => c.id)).toEqual(replies.map((c) => c.id))
	})

	it("hides comments from someone the viewer blocked, or who blocked them", async () => {
		const { post } = await scene()
		const viewer = await makeUser()
		const blocked = await makeUser()
		const blocker = await makeUser()
		const friend = await makeUser()
		await db.insert(userBlocks).values([
			{ blockerId: viewer.id, blockedId: blocked.id },
			{ blockerId: blocker.id, blockedId: viewer.id },
		])
		const top = await sendPostComment(friend, post.id, say("Hi"))
		await sendPostComment(blocked, post.id, say("Blocked"))
		await sendPostComment(blocker, post.id, say("Blocker"))
		await sendPostComment(blocked, post.id, {
			...say("Reply"),
			parentId: top.id,
		})

		const page = await topLevelComments(viewer.id, post.id, { sort: "newest" })
		expect(page.items.map((c) => c.id)).toEqual([top.id])
		expect((await replyCounts(viewer.id, [top.id])).get(top.id)).toBeUndefined()
		expect((await replyCounts(null, [top.id])).get(top.id)).toBe(1)
	})

	it("finds one top-level comment on its own post, for paging its replies", async () => {
		const { post } = await scene()
		const other = await scene()
		const viewer = await makeUser()
		const blocked = await makeUser()
		await db
			.insert(userBlocks)
			.values({ blockerId: viewer.id, blockedId: blocked.id })
		const top = await sendPostComment(viewer, post.id, say("Top"))
		const reply = await sendPostComment(viewer, post.id, {
			...say("Reply"),
			parentId: top.id,
		})
		const hidden = await sendPostComment(blocked, post.id, say("Hidden"))

		expect((await topLevelComment(viewer.id, post.id, top.id))?.id).toBe(top.id)
		expect(await topLevelComment(viewer.id, post.id, reply.id)).toBeNull()
		expect(await topLevelComment(viewer.id, other.post.id, top.id)).toBeNull()
		expect(await topLevelComment(viewer.id, post.id, hidden.id)).toBeNull()
	})
})

describe("comments_one_target", () => {
	it("holds a comment to exactly one of a challenge, a chain and a post", async () => {
		const { post, author } = await scene()
		const group = await makeGroup({ admin: author })
		const [chain] = await db
			.insert(chains)
			.values({ groupId: group.id, starterId: author.id })
			.returning()
		if (!chain) throw new Error("chain insert failed")

		await expect(
			db.insert(comments).values({
				senderId: author.id,
				kind: "post",
				postId: post.id,
				chainId: chain.id,
				text: "Both",
			}),
		).rejects.toThrow()
		await expect(
			db
				.insert(comments)
				.values({ senderId: author.id, kind: "post", text: "Neither" }),
		).rejects.toThrow()
		await expect(
			db.insert(comments).values({
				senderId: author.id,
				kind: "post",
				postId: post.id,
				text: "One",
			}),
		).resolves.toBeTruthy()
	})

	it("still takes a chain's comment, which can't thread", async () => {
		const { author } = await scene()
		const group = await makeGroup({ admin: author })
		const [chain] = await db
			.insert(chains)
			.values({ groupId: group.id, starterId: author.id })
			.returning()
		if (!chain) throw new Error("chain insert failed")
		await expect(
			sendChainComment(author, chain.id, { text: "In the chain" }),
		).resolves.toMatchObject({ chainId: chain.id, parentId: null })
	})
})
