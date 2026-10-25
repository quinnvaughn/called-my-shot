import { defaultPromptColor } from "@called-my-shot/schemas"
import { describe, expect, it } from "vitest"
import { db } from "../../../db"
import { blockUser } from "../../../lib/pressers/actions"
import {
	makeGroup,
	makeLeague,
	makePlayer,
	makePrompt,
	makeRushmore,
	makeStint,
	makeTeam,
	makeUser,
} from "../../../test/factories"
import { execute, expectData } from "../../../test/graphql"

async function franchise() {
	const league = await makeLeague({ slug: "nba" })
	const team = await makeTeam({ leagueId: league.id, name: "Boston Celtics" })
	const prompt = await makePrompt({
		leagueId: league.id,
		teamId: team.id,
		code: "boston-celtics",
		title: "Boston Celtics Rushmore",
	})
	const players = []
	for (const [i, name] of [
		"Bill Russell",
		"Larry Bird",
		"Bob Cousy",
		"John Havlicek",
		"Paul Pierce",
	].entries()) {
		const player = await makePlayer({ name })
		await makeStint(player.id, team.id, {
			score: 100 - i,
			firstSeason: 1957 + i,
		})
		players.push(player)
	}
	return { league, team, prompt, players }
}

const CREATE = /* GraphQL */ `
	mutation Create($input: CreateRushmoreInput!) {
		createRushmore(input: $input) {
			__typename
			... on PostPayload { post { id } }
			... on ValidationError { message }
			... on AuthorizationError { message }
		}
	}
`

const POST = /* GraphQL */ `
	query Post($id: ID!) {
		post(id: $id) {
			__typename
			id
			author { username }
			shareCode
			viewerIsAuthor
			likeCount
			tags { kind role team { name } }
			... on RushmorePost {
				prompt { code answerCount consensus { player { name } sharePercent } }
				picks { position sharePercent player { name portraitUrl } }
			}
		}
	}
`

type PostData = {
	post: {
		__typename: string
		id: string
		author: { username: string }
		shareCode: string | null
		viewerIsAuthor: boolean
		likeCount: number
		tags: { kind: string; role: string; team: { name: string } | null }[]
		prompt: {
			code: string
			answerCount: number
			consensus: { player: { name: string }; sharePercent: number }[]
		}
		picks: {
			position: number
			sharePercent: number
			player: { name: string; portraitUrl: string | null }
		}[]
	} | null
}

describe("Rushmore posts over GraphQL", () => {
	it("creates one and reads it back with its picks, tags and the crowd's numbers", async () => {
		const { prompt, players } = await franchise()
		const author = await makeUser()
		const result = await expectData<{
			createRushmore: { __typename: string; post?: { id: string } }
		}>(CREATE, {
			as: author,
			variables: {
				input: {
					promptId: prompt.id,
					body: "Banners.",
					playerIds: players.slice(0, 4).map((player) => player.id),
				},
			},
		})
		expect(result.createRushmore.__typename).toBe("PostPayload")
		const postId = result.createRushmore.post?.id

		const data = await expectData<PostData>(POST, {
			as: author,
			variables: { id: postId },
		})
		expect(data.post).toMatchObject({
			__typename: "RushmorePost",
			shareCode: "boston-celtics",
			viewerIsAuthor: true,
			likeCount: 0,
			prompt: { code: "boston-celtics", answerCount: 1 },
		})
		expect(data.post?.picks.map((pick) => pick.player.name)).toEqual([
			"Bill Russell",
			"Larry Bird",
			"Bob Cousy",
			"John Havlicek",
		])
		expect(data.post?.picks.every((pick) => pick.sharePercent === 100)).toBe(
			true,
		)
		expect(data.post?.tags.find((tag) => tag.kind === "TEAM")?.team?.name).toBe(
			"Boston Celtics",
		)
		expect(
			data.post?.tags.filter((tag) => tag.role === "MENTION"),
		).toHaveLength(4)
	})

	it("returns a ValidationError for a second public answer", async () => {
		const { prompt, players } = await franchise()
		const author = await makeUser()
		const variables = {
			input: {
				promptId: prompt.id,
				playerIds: players.slice(0, 4).map((player) => player.id),
			},
		}
		await expectData(CREATE, { as: author, variables })
		const again = await expectData<{
			createRushmore: { __typename: string; message?: string }
		}>(CREATE, { as: author, variables })
		expect(again.createRushmore).toEqual({
			__typename: "ValidationError",
			message: "You already have a Rushmore for this.",
		})
	})

	it("keeps a group's post from anyone outside the group", async () => {
		const { prompt, players } = await franchise()
		const member = await makeUser()
		const group = await makeGroup({ admin: member })
		const post = await makeRushmore({
			author: member,
			prompt,
			groupId: group.id,
			playerIds: players.slice(0, 4).map((player) => player.id),
		})
		const outside = await expectData<PostData>(POST, {
			as: await makeUser(),
			variables: { id: post.id },
		})
		expect(outside.post).toBeNull()
		const inside = await expectData<PostData>(POST, {
			as: member,
			variables: { id: post.id },
		})
		expect(inside.post?.shareCode).toBeNull()
	})

	it("returns null for an id that isn't one", async () => {
		const data = await expectData<PostData>(POST, { variables: { id: "nope" } })
		expect(data.post).toBeNull()
	})
})

const COMMENT = /* GraphQL */ `
	mutation Comment($input: SendPostCommentInput!) {
		sendPostComment(input: $input) {
			__typename
			... on PostCommentPayload { comment { id } }
			... on ValidationError { message }
		}
	}
`

const THREAD = /* GraphQL */ `
	query Thread($id: ID!) {
		post(id: $id) {
			commentCount
			comments(sort: TOP) {
				items {
					text
					likeCount
					viewerLiked
					replyCount
					replies { items { text replyTo { username } } pageInfo { hasNextPage } }
				}
			}
		}
	}
`

describe("post comments over GraphQL", () => {
	it("threads replies under their comment, with likes", async () => {
		const { prompt, players } = await franchise()
		const author = await makeUser()
		const post = await makeRushmore({
			author,
			prompt,
			playerIds: players.slice(0, 4).map((player) => player.id),
		})
		const [amy, ben, cal] = await Promise.all([
			makeUser({ username: "amy" }),
			makeUser({ username: "ben" }),
			makeUser({ username: "cal" }),
		])
		const sent = await expectData<{
			sendPostComment: { comment: { id: string } }
		}>(COMMENT, {
			as: amy,
			variables: {
				input: { postId: post.id, text: "Bird over all" },
			},
		})
		const topId = sent.sendPostComment.comment.id
		for (const [who, text, replyTo] of [
			[ben, "No", null],
			[cal, "Ben's wrong", ben.id],
			[amy, "Thanks cal", cal.id],
		] as const) {
			await expectData(COMMENT, {
				as: who,
				variables: {
					input: {
						postId: post.id,
						text,
						parentId: topId,
						replyToUserId: replyTo,
					},
				},
			})
		}
		await expectData(
			/* GraphQL */ `mutation Like($id: ID!) { likeComment(commentId: $id) { __typename } }`,
			{ as: ben, variables: { id: topId } },
		)

		type Thread = {
			post: {
				commentCount: number
				comments: {
					items: {
						text: string
						likeCount: number
						viewerLiked: boolean
						replyCount: number
						replies: {
							items: { text: string; replyTo: { username: string } | null }[]
							pageInfo: { hasNextPage: boolean }
						}
					}[]
				}
			}
		}
		const data = await expectData<Thread>(THREAD, {
			as: ben,
			variables: { id: post.id },
		})
		expect(data.post.commentCount).toBe(4)
		const [top] = data.post.comments.items
		expect(top).toMatchObject({
			text: "Bird over all",
			likeCount: 1,
			viewerLiked: true,
			replyCount: 3,
		})
		expect(top?.replies.items).toEqual([
			{ text: "No", replyTo: null },
			{ text: "Ben's wrong", replyTo: { username: "ben" } },
		])
		expect(top?.replies.pageInfo.hasNextPage).toBe(true)

		const INBOX = /* GraphQL */ `
			query {
				notifications {
					... on QueryNotificationsSuccess {
						data {
							items {
								__typename
								... on PostCommentedNotification { lastCommenterUsername post { id } }
								... on CommentRepliedNotification { lastReplierUsername comment { id } }
							}
						}
					}
				}
			}
		`
		type Inbox = {
			notifications: { data: { items: Record<string, unknown>[] } }
		}
		const authorInbox = await expectData<Inbox>(INBOX, { as: author })
		expect(authorInbox.notifications.data.items).toEqual([
			{
				__typename: "PostCommentedNotification",
				lastCommenterUsername: "amy",
				post: { id: post.id },
			},
		])
		const amyInbox = await expectData<Inbox>(INBOX, { as: amy })
		expect(amyInbox.notifications.data.items).toEqual([
			{
				__typename: "CommentRepliedNotification",
				lastReplierUsername: "cal",
				comment: { id: topId },
			},
		])
	})
})

const FOLLOW = /* GraphQL */ `
	mutation Follow($kind: FollowTargetKind!, $id: ID!) {
		follow(kind: $kind, id: $id) {
			__typename
			... on FollowPayload { following user { viewerFollows followerCount } team { viewerFollows } }
			... on ValidationError { message }
		}
	}
`

describe("follows over GraphQL", () => {
	it("follows a person and a team, counts it, and tells the person", async () => {
		const fan = await makeUser()
		const star = await makeUser()
		const team = await makeTeam()

		const followed = await expectData<{
			follow: {
				following: boolean
				user: { viewerFollows: boolean; followerCount: number }
			}
		}>(FOLLOW, { as: fan, variables: { kind: "USER", id: star.id } })
		expect(followed.follow).toMatchObject({
			following: true,
			user: { viewerFollows: true, followerCount: 1 },
		})
		await expectData(FOLLOW, {
			as: fan,
			variables: { kind: "USER", id: star.id },
		})
		await expectData(FOLLOW, {
			as: fan,
			variables: { kind: "TEAM", id: team.id },
		})

		const mine = await expectData<{
			myFollows: { teams: { id: string }[]; users: { username: string }[] }
		}>(
			/* GraphQL */ `query { myFollows { teams { id } users { username } } }`,
			{
				as: fan,
			},
		)
		expect(mine.myFollows.teams).toEqual([{ id: team.id }])
		expect(mine.myFollows.users).toEqual([{ username: star.username }])

		const notes = await db.query.notifications.findMany({
			where: { userId: star.id },
		})
		expect(notes.map((n) => n.type)).toEqual(["user_followed"])

		await expectData(
			/* GraphQL */ `mutation Unfollow($id: ID!) { unfollow(kind: USER, id: $id) { __typename } }`,
			{ as: fan, variables: { id: star.id } },
		)
		const after = await expectData(
			/* GraphQL */ `query { myFollows { users { username } } }`,
			{ as: fan },
		)
		expect(after).toEqual({ myFollows: { users: [] } })
	})

	it("ends following both ways when one blocks the other", async () => {
		const a = await makeUser()
		const b = await makeUser()
		await expectData(FOLLOW, { as: a, variables: { kind: "USER", id: b.id } })
		await expectData(FOLLOW, { as: b, variables: { kind: "USER", id: a.id } })
		await blockUser(a, b.username)
		expect(await db.query.follows.findMany()).toEqual([])
		const again = await expectData<{ follow: { __typename: string } }>(FOLLOW, {
			as: b,
			variables: { kind: "USER", id: a.id },
		})
		expect(again.follow.__typename).toBe("AuthorizationError")
	})

	it("can't follow yourself", async () => {
		const me = await makeUser()
		const result = await expectData<{
			follow: { __typename: string; message?: string }
		}>(FOLLOW, { as: me, variables: { kind: "USER", id: me.id } })
		expect(result.follow).toEqual({
			__typename: "ValidationError",
			message: "You can't follow yourself.",
		})
	})

	it("follows favorite teams and their leagues, and keeps them when a favorite goes", async () => {
		const fan = await makeUser()
		const league = await makeLeague()
		const team = await makeTeam({ leagueId: league.id })
		const SET = /* GraphQL */ `
			mutation Set($ids: [ID!]!) { setFavoriteTeams(teamIds: $ids) { __typename } }
		`
		await expectData(SET, { as: fan, variables: { ids: [team.id] } })
		await expectData(SET, { as: fan, variables: { ids: [] } })
		const rows = await db.query.follows.findMany({
			where: { followerId: fan.id },
		})
		expect(
			rows.map((row) => `${row.targetKind}:${row.targetId}`).sort(),
		).toEqual([`league:${league.id}`, `team:${team.id}`].sort())
	})
})

const CREATE_PROMPT = /* GraphQL */ `
	mutation New($input: CreateRushmorePromptInput!) {
		createRushmorePrompt(input: $input) {
			__typename
			... on RushmorePromptPayload {
				prompt { id positions fromYear toYear }
			}
			... on ValidationError { fieldErrors { field message } }
		}
	}
`

describe("prompts over GraphQL", () => {
	it("starts a prompt, finds it by code and by search, and lists its pool", async () => {
		const { league, team, players } = await franchise()
		const creator = await makeUser()
		const created = await expectData<{
			createRushmorePrompt: { __typename: string; prompt?: { code: string } }
		}>(
			/* GraphQL */ `
				mutation New($input: CreateRushmorePromptInput!) {
					createRushmorePrompt(input: $input) {
						__typename
						... on RushmorePromptPayload { prompt { code } }
					}
				}
			`,
			{
				as: creator,
				variables: {
					input: {
						title: "Celtics big men Rushmore",
						leagueId: league.id,
						teamId: team.id,
					},
				},
			},
		)
		expect(created.createRushmorePrompt.__typename).toBe(
			"RushmorePromptPayload",
		)
		const code = created.createRushmorePrompt.prompt?.code ?? ""
		// Stored as what it's of; the word Rushmore comes off.
		expect(code).toBe("celtics-big-men")

		const data = await expectData<{
			prompt: { title: string; viewerIsCreator: boolean; id: string }
			searchPrompts: { title: string }[]
		}>(
			/* GraphQL */ `
				query Find($code: String!, $leagueId: ID!) {
					prompt(code: $code) { id title viewerIsCreator }
					searchPrompts(leagueId: $leagueId, query: "big men") { title }
				}
			`,
			{
				as: creator,
				variables: { code: code.toUpperCase(), leagueId: league.id },
			},
		)
		expect(data.prompt).toMatchObject({
			title: "Celtics big men",
			viewerIsCreator: true,
		})
		expect(data.searchPrompts).toEqual([{ title: "Celtics big men" }])

		const pool = await expectData<{
			rushmorePool: { player: { name: string }; firstSeason: number }[]
		}>(
			/* GraphQL */ `
				query Pool($promptId: ID!) {
					rushmorePool(promptId: $promptId, search: "b", first: 3) {
						player { name }
						firstSeason
					}
				}
			`,
			{ variables: { promptId: data.prompt.id } },
		)
		expect(pool.rushmorePool.map((entry) => entry.player.name)).toEqual([
			"Bill Russell",
			"Larry Bird",
			"Bob Cousy",
		])
		expect(players).toHaveLength(5)
	})

	it("starts a prompt open to every sport and finds it without a league", async () => {
		const created = await expectData<{
			createRushmorePrompt: {
				__typename: string
				prompt?: { code: string; league: { id: string } | null }
			}
		}>(
			/* GraphQL */ `
				mutation New($input: CreateRushmorePromptInput!) {
					createRushmorePrompt(input: $input) {
						__typename
						... on RushmorePromptPayload { prompt { code league { id } } }
					}
				}
			`,
			{
				as: await makeUser(),
				variables: { input: { title: "Worcester sports legends Rushmore" } },
			},
		)
		expect(created.createRushmorePrompt.prompt?.league).toBeNull()

		const data = await expectData<{ searchPrompts: { title: string }[] }>(
			/* GraphQL */ `
				query {
					searchPrompts(query: "worcester legends") { title }
				}
			`,
		)
		expect(data.searchPrompts).toEqual([{ title: "Worcester sports legends" }])
	})

	it("narrows a prompt to positions and years, and its pool with it", async () => {
		const league = await makeLeague({ abbreviation: "NBA" })
		const team = await makeTeam({ leagueId: league.id })
		const guard = await makePlayer({ name: "Rajon Rondo" })
		await makeStint(guard.id, team.id, {
			positions: ["PG"],
			firstSeason: 2007,
			lastSeason: 2015,
		})
		const center = await makePlayer({ name: "Robert Parish" })
		await makeStint(center.id, team.id, {
			positions: ["C"],
			firstSeason: 1981,
			lastSeason: 1994,
		})

		const created = await expectData<{
			createRushmorePrompt: {
				prompt?: {
					id: string
					positions: string[]
					fromYear: number | null
					toYear: number | null
				}
			}
		}>(CREATE_PROMPT, {
			as: await makeUser(),
			variables: {
				input: {
					title: "Celtics 2010s guards Rushmore",
					teamId: team.id,
					positions: ["PG", "SG"],
					fromYear: 2010,
					toYear: 2019,
				},
			},
		})
		const prompt = created.createRushmorePrompt.prompt
		expect(prompt).toMatchObject({
			positions: ["PG", "SG"],
			fromYear: 2010,
			toYear: 2019,
		})

		const pool = await expectData<{
			rushmorePool: { player: { name: string } }[]
		}>(
			/* GraphQL */ `
				query Pool($promptId: ID!) {
					rushmorePool(promptId: $promptId) { player { name } }
				}
			`,
			{ variables: { promptId: prompt?.id } },
		)
		expect(pool.rushmorePool.map((entry) => entry.player.name)).toEqual([
			"Rajon Rondo",
		])
	})

	it("won't take positions without a league, or ones the league doesn't have", async () => {
		const league = await makeLeague({ abbreviation: "NHL" })
		const author = await makeUser()
		const errorsFor = async (input: Record<string, unknown>) =>
			(
				await expectData<{
					createRushmorePrompt: { fieldErrors?: { field: string | null }[] }
				}>(CREATE_PROMPT, { as: author, variables: { input } })
			).createRushmorePrompt.fieldErrors?.map((error) => error.field)

		expect(
			await errorsFor({ title: "Any sport goalies", positions: ["G"] }),
		).toEqual(["positions"])
		expect(
			await errorsFor({
				title: "Hockey point guards",
				leagueId: league.id,
				positions: ["PG"],
			}),
		).toEqual(["positions"])
		expect(
			await errorsFor({
				title: "Backwards years",
				fromYear: 2020,
				toYear: 2010,
			}),
		).toEqual(["toYear"])
	})

	it("draws a prompt in its creator's color, its title's, or its team's", async () => {
		const { team } = await franchise()
		const author = await makeUser()
		const colorOf = async (input: Record<string, unknown>) => {
			const data = await expectData<{
				createRushmorePrompt: {
					prompt?: { color: string }
					fieldErrors?: { field: string | null }[]
				}
			}>(
				/* GraphQL */ `
					mutation New($input: CreateRushmorePromptInput!) {
						createRushmorePrompt(input: $input) {
							... on RushmorePromptPayload { prompt { color } }
							... on ValidationError { fieldErrors { field } }
						}
					}
				`,
				{ as: author, variables: { input } },
			)
			return (
				data.createRushmorePrompt.prompt?.color ??
				data.createRushmorePrompt.fieldErrors?.map((e) => e.field)
			)
		}

		expect(
			await colorOf({ title: "Left-handed closers", color: "#5B3A9E" }),
		).toBe("#5B3A9E")
		expect(await colorOf({ title: "Bench mobs" })).toBe(
			defaultPromptColor("Bench mobs"),
		)
		expect(
			await colorOf({
				title: "Celtics sixth men",
				teamId: team.id,
				color: "#5B3A9E",
			}),
		).toBe(team.color)
		expect(await colorOf({ title: "Neon sneakers", color: "#00FF00" })).toEqual(
			["color"],
		)
	})

	it("takes a team's league for a prompt narrowed to the team", async () => {
		const { league, team } = await franchise()
		const created = await expectData<{
			createRushmorePrompt: { prompt?: { league: { id: string } | null } }
		}>(
			/* GraphQL */ `
				mutation New($input: CreateRushmorePromptInput!) {
					createRushmorePrompt(input: $input) {
						... on RushmorePromptPayload { prompt { league { id } } }
					}
				}
			`,
			{
				as: await makeUser(),
				variables: {
					input: { title: "Celtics sixth men Rushmore", teamId: team.id },
				},
			},
		)
		expect(created.createRushmorePrompt.prompt?.league).toEqual({
			id: league.id,
		})
	})

	it("turns away a title that's too short", async () => {
		const league = await makeLeague()
		const result = await execute(
			/* GraphQL */ `
				mutation New($input: CreateRushmorePromptInput!) {
					createRushmorePrompt(input: $input) {
						__typename
					}
				}
			`,
			{
				as: await makeUser(),
				variables: { input: { title: "ab", leagueId: league.id } },
			},
		)
		expect(result.data).toEqual({
			createRushmorePrompt: { __typename: "ValidationError" },
		})
	})
})
