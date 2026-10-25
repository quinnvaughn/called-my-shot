import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "../db"
import { chains, notifications } from "../db/schema"
import {
	makeGroup,
	makeLeague,
	makePlayer,
	makePrompt,
	makeRushmore,
	makeUser,
} from "../test/factories"
import { testContext } from "../test/graphql"
import { sendChainComment } from "./chains/comment"
import { NotFoundError, ValidationError } from "./errors"
import {
	commentLikeCountLoader,
	likeComment,
	likePost,
	likesMilestone,
	postLikeCountLoader,
	unlikeComment,
	unlikePost,
	viewerLikedPostLoader,
} from "./likes"
import { sendPostComment } from "./posts/comment"

async function scene() {
	const league = await makeLeague()
	const prompt = await makePrompt({ leagueId: league.id })
	const players = await Promise.all(
		Array.from({ length: 4 }, () => makePlayer()),
	)
	const author = await makeUser()
	const post = await makeRushmore({
		author,
		prompt,
		playerIds: players.map((player) => player.id),
	})
	return { prompt, players, author, post }
}

async function likedBy(
	n: number,
	like: (fan: Awaited<ReturnType<typeof makeUser>>) => Promise<void>,
) {
	const fans = []
	for (let i = 0; i < n; i++) {
		const fan = await makeUser()
		await like(fan)
		fans.push(fan)
	}
	return fans
}

const milestoneNotices = (userId: string) =>
	db.query.notifications.findMany({
		where: { userId, type: "likes_milestone" },
	})

describe("likesMilestone", () => {
	it("is 10, 25, 50, 100 and then every hundred, never below 10", () => {
		expect(
			[1, 9, 10, 24, 25, 49, 50, 99, 100, 199, 200, 350].map(likesMilestone),
		).toEqual([null, null, 10, 10, 25, 25, 50, 50, 100, 100, 200, 300])
	})
})

describe("likes milestones", () => {
	it("tells a post's author at 10 likes and not before, in one row that moves up", async () => {
		const { author, post } = await scene()
		await likedBy(9, (fan) => likePost(fan, post.id))
		expect(await milestoneNotices(author.id)).toEqual([])

		await likedBy(1, (fan) => likePost(fan, post.id))
		const [atTen] = await milestoneNotices(author.id)
		expect(atTen).toMatchObject({
			postId: post.id,
			commentId: null,
			achievementCount: 10,
		})

		await db
			.update(notifications)
			.set({ readAt: new Date() })
			.where(eq(notifications.userId, author.id))
		await likedBy(15, (fan) => likePost(fan, post.id))
		const rows = await milestoneNotices(author.id)
		expect(rows).toHaveLength(1)
		expect(rows[0]).toMatchObject({ achievementCount: 25, readAt: null })
	})

	it("doesn't announce a milestone twice when a like is taken back and given again", async () => {
		const { author, post } = await scene()
		const fans = await likedBy(10, (fan) => likePost(fan, post.id))
		const [first] = await milestoneNotices(author.id)
		await db
			.update(notifications)
			.set({ readAt: new Date() })
			.where(eq(notifications.userId, author.id))

		const last = fans[fans.length - 1]
		if (!last) throw new Error("no fans")
		await unlikePost(last, post.id)
		await likePost(last, post.id)
		const [again] = await milestoneNotices(author.id)
		expect(again?.id).toBe(first?.id)
		expect(again?.readAt).not.toBeNull()
	})

	it("tells a comment's author about the comment, apart from the post", async () => {
		const { post } = await scene()
		const commenter = await makeUser()
		const comment = await sendPostComment(commenter, post.id, { text: "Yes" })
		await likedBy(10, (fan) => likeComment(fan, comment.id))
		expect(await milestoneNotices(commenter.id)).toEqual([
			expect.objectContaining({
				postId: post.id,
				commentId: comment.id,
				achievementCount: 10,
			}),
		])
	})
})

describe("likes", () => {
	it("counts a post like once however many times it's sent, and unliking twice is fine", async () => {
		const { post } = await scene()
		const fan = await makeUser()
		await likePost(fan, post.id)
		await likePost(fan, post.id)
		expect(await postLikeCountLoader(testContext()).load(post.id)).toBe(1)
		expect(await viewerLikedPostLoader(testContext(fan)).load(post.id)).toBe(
			true,
		)

		await unlikePost(fan, post.id)
		await unlikePost(fan, post.id)
		expect(await postLikeCountLoader(testContext()).load(post.id)).toBe(0)
	})

	it("counts a comment like once too", async () => {
		const { post } = await scene()
		const fan = await makeUser()
		const comment = await sendPostComment(fan, post.id, { text: "Yes" })
		await likeComment(fan, comment.id)
		await likeComment(fan, comment.id)
		expect(await commentLikeCountLoader(testContext()).load(comment.id)).toBe(1)
		await unlikeComment(fan, comment.id)
		expect(await commentLikeCountLoader(testContext()).load(comment.id)).toBe(0)
	})

	it("won't like a group's post from outside it, or a chain's comment", async () => {
		const { prompt, players } = await scene()
		const member = await makeUser()
		const group = await makeGroup({ admin: member })
		const groupPost = await makeRushmore({
			author: member,
			prompt,
			groupId: group.id,
			playerIds: players.map((player) => player.id),
		})
		await expect(
			likePost(await makeUser(), groupPost.id),
		).rejects.toBeInstanceOf(NotFoundError)

		const [chain] = await db
			.insert(chains)
			.values({ groupId: group.id, starterId: member.id })
			.returning()
		if (!chain) throw new Error("chain insert failed")
		const chainComment = await sendChainComment(member, chain.id, {
			text: "Chain talk",
		})
		await expect(likeComment(member, chainComment.id)).rejects.toBeInstanceOf(
			ValidationError,
		)
	})
})
