import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "../../../db"
import { chains } from "../../../db/schema"
import { startChain } from "../../../lib/chains/mutate"
import {
	futureDate,
	makeCall,
	makeGame,
	makeGroup,
	makeLeague,
	makeOption,
	makeQuestion,
	makeSelection,
	makeUser,
} from "../../../test/factories"
import { expectData } from "../../../test/graphql"

type User = Awaited<ReturnType<typeof makeUser>>

async function linkCall(leagueId: string, user: User, chance = 0.5) {
	const game = await makeGame({ leagueId })
	const question = await makeQuestion({
		leagueId,
		seasonId: game.seasonId,
		shape: "team_vs_team",
		isOfficial: true,
		resolutionMode: "system",
		gameId: game.id,
		locksAt: futureDate(2),
	})
	const home = await makeOption(question.id, {
		label: "Home",
		modelHitRate: chance,
	})
	await makeOption(question.id, { label: "Away", modelHitRate: 1 - chance })
	const call = await makeCall(question.id, user.id)
	await makeSelection(call.id, home.id)
	return call
}

const CHAIN = /* GraphQL */ `
	query Chain($id: ID!) {
		chain(id: $id) {
			phase
			viewerIsStarter
			viewerJoinBlockedReason
			multiplierForNewLink
			links { user { username } hitChance multiplier }
			viewerLinkCandidates { hitChance reason }
			events { kind }
			comments { items { text sender { username } } }
		}
	}
`

type ChainData = {
	chain: {
		phase: string
		viewerIsStarter: boolean
		viewerJoinBlockedReason: string | null
		multiplierForNewLink: number
		links: {
			user: { username: string }
			hitChance: number
			multiplier: number
		}[]
		viewerLinkCandidates: { hitChance: number | null; reason: string | null }[]
		events: { kind: string }[]
		comments: { items: { text: string; sender: { username: string } }[] }
	} | null
}

const REQUEST = /* GraphQL */ `
	mutation Request($input: RequestChainLinkInput!) {
		requestChainLink(input: $input) {
			__typename
			... on ChainPayload { chain { pendingRequests { id } } }
			... on ValidationError { fieldErrors { message } }
		}
	}
`

const COMMENT = /* GraphQL */ `
	mutation Comment($input: SendChainCommentInput!) {
		sendChainComment(input: $input) {
			__typename
			... on ChainCommentPayload { comment { text } }
			... on Error { message }
		}
	}
`

async function setup() {
	const league = await makeLeague()
	const [amy, ben, outsider] = [
		await makeUser(),
		await makeUser(),
		await makeUser(),
	]
	const group = await makeGroup({ admin: amy, members: [ben] })
	const call = await linkCall(league.id, amy, 0.2)
	const chain = await db.transaction((tx) =>
		startChain(tx, amy, { groupId: group.id, callId: call.id }),
	)
	return { league, amy, ben, outsider, group, chain }
}

describe("chain", () => {
	it("shows a member the chain and what joining would be worth", async () => {
		const { ben, chain, league } = await setup()
		await linkCall(league.id, ben)
		const data = await expectData<ChainData>(CHAIN, {
			as: ben,
			variables: { id: chain.id },
		})
		expect(data.chain).toMatchObject({
			phase: "OPEN",
			viewerIsStarter: false,
			viewerJoinBlockedReason: null,
			multiplierForNewLink: 5.5,
		})
		expect(data.chain?.viewerLinkCandidates).toEqual([
			{ hitChance: 0.5, reason: null },
		])
		expect(data.chain?.events.map((event) => event.kind)).toEqual(["STARTED"])
	})

	it("is hidden from anyone outside the group", async () => {
		const { outsider, chain } = await setup()
		const data = await expectData<ChainData>(CHAIN, {
			as: outsider,
			variables: { id: chain.id },
		})
		expect(data.chain).toBeNull()
	})

	it("puts a request in front of the starter", async () => {
		const { amy, ben, chain, league } = await setup()
		const call = await linkCall(league.id, ben)
		const data = await expectData<{
			requestChainLink: { __typename: string }
		}>(REQUEST, {
			as: ben,
			variables: { input: { chainId: chain.id, callId: call.id } },
		})
		expect(data.requestChainLink.__typename).toBe("ChainPayload")

		const starter = await expectData<{
			chain: { pendingRequests: { id: string }[] }
		}>(
			/* GraphQL */ `query($id: ID!) { chain(id: $id) { pendingRequests { id } } }`,
			{ as: amy, variables: { id: chain.id } },
		)
		expect(starter.chain.pendingRequests).toHaveLength(1)
	})

	it("lets anyone in the group post in the thread", async () => {
		const { amy, ben, chain } = await setup()
		const data = await expectData<{
			sendChainComment: { __typename: string }
		}>(COMMENT, {
			as: ben,
			variables: { input: { chainId: chain.id, text: "no chance" } },
		})
		expect(data.sendChainComment.__typename).toBe("ChainCommentPayload")

		const read = await expectData<ChainData>(CHAIN, {
			as: amy,
			variables: { id: chain.id },
		})
		expect(read.chain?.comments.items[0]).toEqual({
			text: "no chance",
			sender: { username: ben.username },
		})
		const notices = await db.query.notifications.findMany({
			where: { type: "chain_commented" },
		})
		expect(notices.map((n) => n.userId)).toEqual([amy.id])
	})

	it("refuses a post from outside the group", async () => {
		const { outsider, chain } = await setup()
		const data = await expectData<{
			sendChainComment: { __typename: string }
		}>(COMMENT, {
			as: outsider,
			variables: { input: { chainId: chain.id, text: "hi" } },
		})
		expect(data.sendChainComment.__typename).toBe("AuthorizationError")
	})
})

describe("a group's chains", () => {
	const LISTS = /* GraphQL */ `
		query Lists($groupId: ID!) {
			group(id: $groupId) {
				activeChainCount
				activeChains { id }
				finishedChains(first: 1) {
					items { id }
					pageInfo { hasNextPage endCursor }
				}
			}
		}
	`
	type Lists = {
		group: {
			activeChainCount: number
			activeChains: { id: string }[]
			finishedChains: {
				items: { id: string }[]
				pageInfo: { hasNextPage: boolean; endCursor: string | null }
			}
		}
	}

	it("lists open chains as active, held and broken ones as finished, and leaves called-off ones out", async () => {
		const { amy, group, league, chain: open } = await setup()
		const start = async () =>
			db.transaction(async (tx) =>
				startChain(tx, amy, {
					groupId: group.id,
					callId: (await linkCall(league.id, amy)).id,
				}),
			)
		const held = await start()
		const broken = await start()
		const calledOff = await start()
		await db
			.update(chains)
			.set({ announcedOutcome: "held" })
			.where(eq(chains.id, held.id))
		await db
			.update(chains)
			.set({ announcedOutcome: "broken" })
			.where(eq(chains.id, broken.id))
		await db
			.update(chains)
			.set({ cancelledAt: new Date() })
			.where(eq(chains.id, calledOff.id))

		const first = await expectData<Lists>(LISTS, {
			as: amy,
			variables: { groupId: group.id },
		})
		expect(first.group.activeChains.map((c) => c.id)).toEqual([open.id])
		expect(first.group.activeChainCount).toBe(1)
		// Newest first, one at a time.
		expect(first.group.finishedChains.items.map((c) => c.id)).toEqual([
			broken.id,
		])
		expect(first.group.finishedChains.pageInfo.hasNextPage).toBe(true)

		const next = await expectData<{
			group: { finishedChains: { items: { id: string }[] } }
		}>(
			/* GraphQL */ `query($groupId: ID!, $after: String) {
				group(id: $groupId) { finishedChains(first: 5, after: $after) { items { id } } }
			}`,
			{
				as: amy,
				variables: {
					groupId: group.id,
					after: first.group.finishedChains.pageInfo.endCursor,
				},
			},
		)
		expect(next.group.finishedChains.items.map((c) => c.id)).toEqual([held.id])
	})
})
