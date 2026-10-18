import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "../../db"
import {
	type Game,
	pointAwards,
	type Question,
	questions,
	userSeasonStats,
} from "../../db/schema"
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
	pastDate,
} from "../../test/factories"
import { resolve } from "../../test/helpers"
import { insertCallInTx } from "../cast-call"
import { buildPushContent } from "../push-content"
import { collapseKeyFor } from "../push-outbox"
import { markQuestionVoided } from "../void-question"
import { drainChainRecomputes } from "./drain"
import { markChainsDirty } from "./enqueue"
import { assertNotActiveLink } from "./hedge"
import { loadChainLinks } from "./load"
import {
	callOffChain,
	decideLink,
	leaveChain,
	releaseLinksOnLeave,
	requestLink,
	startChain,
} from "./mutate"
import { chainPhase } from "./state"
import { chainTimeline } from "./timeline"

type User = Awaited<ReturnType<typeof makeUser>>
type LinkQ = Question & { a: string; b: string; game: Game }

// An official, system-graded matchup on its own game, priced so side a hits
// `chance` of the time.
async function linkQuestion(
	leagueId: string,
	chance = 0.5,
	overrides: Partial<typeof questions.$inferInsert> = {},
): Promise<LinkQ> {
	const game = await makeGame({ leagueId })
	const question = await makeQuestion({
		leagueId,
		seasonId: game.seasonId,
		shape: "team_vs_team",
		isOfficial: true,
		resolutionMode: "system",
		gameId: game.id,
		locksAt: futureDate(2),
		...overrides,
	})
	const a = await makeOption(question.id, {
		label: "Home",
		sortOrder: 0,
		modelHitRate: chance,
	})
	const b = await makeOption(question.id, {
		label: "Away",
		sortOrder: 1,
		modelHitRate: 1 - chance,
	})
	return { ...question, a: a.id, b: b.id, game }
}

async function callOn(q: LinkQ, user: User, side: "a" | "b", conviction = 100) {
	const call = await makeCall(q.id, user.id)
	await makeSelection(call.id, q[side], conviction)
	return call
}

const start = (user: User, groupId: string, callId: string) =>
	db.transaction((tx) => startChain(tx, user, { groupId, callId }))
const request = (user: User, chainId: string, callId: string) =>
	db.transaction((tx) => requestLink(tx, user, { chainId, callId }))
const decide = (starter: User, linkId: string, approve = true) =>
	db.transaction((tx) => decideLink(tx, starter, linkId, approve))

async function linksOf(chainId: string) {
	return (await loadChainLinks([chainId])).get(chainId) ?? []
}

async function pendingLinkId(chainId: string, userId: string) {
	const link = (await linksOf(chainId)).find(
		(l) => l.userId === userId && l.status === "requested",
	)
	if (!link) throw new Error("no pending link")
	return link.id
}

// A group of three, each with a call on their own game, chained together.
async function threeLinkChain(chances = [0.5, 0.5, 0.5]) {
	const league = await makeLeague()
	const [amy, ben, cara] = [
		await makeUser(),
		await makeUser(),
		await makeUser(),
	]
	const group = await makeGroup({ admin: amy, members: [ben, cara] })
	const qs = [
		await linkQuestion(league.id, chances[0]),
		await linkQuestion(league.id, chances[1]),
		await linkQuestion(league.id, chances[2]),
	]
	const calls = [
		await callOn(qs[0], amy, "a", 100),
		await callOn(qs[1], ben, "a", 60),
		await callOn(qs[2], cara, "a", 30),
	]
	const chain = await start(amy, group.id, calls[0].id)
	await request(ben, chain.id, calls[1].id)
	await decide(amy, await pendingLinkId(chain.id, ben.id))
	await request(cara, chain.id, calls[2].id)
	await decide(amy, await pendingLinkId(chain.id, cara.id))
	return { league, group, amy, ben, cara, qs, calls, chain }
}

// Locks it now rather than in the past, so the lock lands after the joins
// the way it always does for real.
async function settle(q: LinkQ, side: "a" | "b") {
	const [locked] = await db
		.update(questions)
		.set({ status: "locked", locksAt: new Date() })
		.where(eq(questions.id, q.id))
		.returning()
	await resolve(locked, { correctOptionIds: [q[side]] })
}

async function awardsOf(chainId: string) {
	const rows = await db.query.pointAwards.findMany({
		where: { kind: "chain", scopeKey: chainId },
	})
	return new Map(rows.map((row) => [row.userId, row.points]))
}

async function bonusOf(userId: string) {
	const rows = await db
		.select({ bonus: userSeasonStats.bonusPoints })
		.from(userSeasonStats)
		.where(eq(userSeasonStats.userId, userId))
	return rows.reduce((sum, row) => sum + row.bonus, 0)
}

describe("starting and joining a chain", () => {
	it("puts the starter's call in as the first link", async () => {
		const league = await makeLeague()
		const amy = await makeUser()
		const group = await makeGroup({ admin: amy })
		const q = await linkQuestion(league.id, 0.2)
		const call = await callOn(q, amy, "a")
		const chain = await start(amy, group.id, call.id)

		const [link] = await linksOf(chain.id)
		expect(link).toMatchObject({ status: "approved", hitChance: 0.2 })
		expect(chainPhase(chain, await linksOf(chain.id))).toBe("open")
	})

	it("refuses a call on a community question", async () => {
		const league = await makeLeague()
		const amy = await makeUser()
		const group = await makeGroup({ admin: amy })
		const q = await linkQuestion(league.id, 0.5, { isOfficial: false })
		const call = await callOn(q, amy, "a")
		await expect(start(amy, group.id, call.id)).rejects.toThrow(
			"Only official questions can be links.",
		)
	})

	it("reads an over/under's chance off its line, by side", async () => {
		const league = await makeLeague()
		const amy = await makeUser()
		const group = await makeGroup({ admin: amy })
		const game = await makeGame({ leagueId: league.id })
		const q = await makeQuestion({
			leagueId: league.id,
			seasonId: game.seasonId,
			shape: "game_total_over_under",
			isOfficial: true,
			resolutionMode: "system",
			gameId: game.id,
			ouLine: 224.5,
			lineBasis: { pOver: 0.56 } as Question["lineBasis"],
		})
		await makeOption(q.id, { label: "Over", sortOrder: 0 })
		const under = await makeOption(q.id, { label: "Under", sortOrder: 1 })
		const call = await makeCall(q.id, amy.id)
		await makeSelection(call.id, under.id)

		const chain = await start(amy, group.id, call.id)
		const [link] = await linksOf(chain.id)
		expect(link?.hitChance).toBeCloseTo(0.44)
	})

	it("takes a request, and the starter decides it", async () => {
		const { chain, ben, cara } = await threeLinkChain()
		const links = await linksOf(chain.id)
		expect(links.filter((l) => l.status === "approved")).toHaveLength(3)
		const notices = await db.query.notifications.findMany({
			where: { userId: ben.id, type: "chain_link_decided" },
		})
		expect(notices).toHaveLength(1)
		expect(links.find((l) => l.userId === cara.id)?.decidedAt).not.toBeNull()
	})

	it("refuses a second link on a question or a game already in", async () => {
		const league = await makeLeague()
		const [amy, ben] = [await makeUser(), await makeUser()]
		const group = await makeGroup({ admin: amy, members: [ben] })
		const q = await linkQuestion(league.id)
		const chain = await start(amy, group.id, (await callOn(q, amy, "a")).id)

		await expect(
			request(ben, chain.id, (await callOn(q, ben, "a")).id),
		).rejects.toThrow("Someone in this chain already has that question.")

		const sameGame = await makeQuestion({
			leagueId: league.id,
			seasonId: q.seasonId,
			shape: "team_vs_team",
			isOfficial: true,
			resolutionMode: "system",
			gameId: q.game.id,
		})
		const opt = await makeOption(sameGame.id, {
			label: "Home",
			modelHitRate: 0.5,
		})
		const other = await makeCall(sameGame.id, ben.id)
		await makeSelection(other.id, opt.id)
		await expect(request(ben, chain.id, other.id)).rejects.toThrow(
			"Every link has to be in a different game",
		)
	})

	it("refuses a request from someone already turned down", async () => {
		const league = await makeLeague()
		const [amy, ben] = [await makeUser(), await makeUser()]
		const group = await makeGroup({ admin: amy, members: [ben] })
		const chain = await start(
			amy,
			group.id,
			(await callOn(await linkQuestion(league.id), amy, "a")).id,
		)
		await request(
			ben,
			chain.id,
			(await callOn(await linkQuestion(league.id), ben, "a")).id,
		)
		await decide(amy, await pendingLinkId(chain.id, ben.id), false)

		await expect(
			request(
				ben,
				chain.id,
				(await callOn(await linkQuestion(league.id), ben, "a")).id,
			),
		).rejects.toThrow("already turned down")
	})

	it("holds at most seven links", async () => {
		const league = await makeLeague()
		const users = await Promise.all(Array.from({ length: 8 }, () => makeUser()))
		const [amy, ...rest] = users as [User, ...User[]]
		const group = await makeGroup({ admin: amy, members: rest })
		const chain = await start(
			amy,
			group.id,
			(await callOn(await linkQuestion(league.id), amy, "a")).id,
		)
		for (const user of rest.slice(0, 6)) {
			await request(
				user,
				chain.id,
				(await callOn(await linkQuestion(league.id), user, "a")).id,
			)
			await decide(amy, await pendingLinkId(chain.id, user.id))
		}
		const last = rest[6] as User
		await expect(
			request(
				last,
				chain.id,
				(await callOn(await linkQuestion(league.id), last, "a")).id,
			),
		).rejects.toThrow("A chain holds up to 7 links.")
	})

	it("stops taking links once the first link's game locks", async () => {
		const league = await makeLeague()
		const [amy, ben] = [await makeUser(), await makeUser()]
		const group = await makeGroup({ admin: amy, members: [ben] })
		const q = await linkQuestion(league.id)
		const chain = await start(amy, group.id, (await callOn(q, amy, "a")).id)
		await db
			.update(questions)
			.set({ locksAt: pastDate(1) })
			.where(eq(questions.id, q.id))
		await expect(
			request(
				ben,
				chain.id,
				(await callOn(await linkQuestion(league.id), ben, "a")).id,
			),
		).rejects.toThrow("This chain has locked.")
	})
})

describe("hedging against your own chain", () => {
	it("refuses a request from someone holding the other side of a link", async () => {
		const league = await makeLeague()
		const [amy, ben] = [await makeUser(), await makeUser()]
		const group = await makeGroup({ admin: amy, members: [ben] })
		const q = await linkQuestion(league.id)
		const chain = await start(amy, group.id, (await callOn(q, amy, "a")).id)
		await callOn(q, ben, "b")
		await expect(
			request(
				ben,
				chain.id,
				(await callOn(await linkQuestion(league.id), ben, "a")).id,
			),
		).rejects.toThrow("You have the other side of a link")
	})

	it("refuses a call on the other side of a chainmate's link", async () => {
		const { qs, ben } = await threeLinkChain()
		const q = qs[0] as LinkQ
		await expect(
			db.transaction((tx) =>
				insertCallInTx(tx, {
					userId: ben.id,
					question: q,
					data: {
						questionId: q.id,
						shape: q.shape,
						caseText: "",
						selections: [{ optionId: q.b, conviction: 50 }],
					} as Parameters<typeof insertCallInTx>[1]["data"],
				}),
			),
		).rejects.toThrow("That's the other side of a link in your chain.")
	})

	it("lets a chainmate take the same side", async () => {
		const { qs, ben } = await threeLinkChain()
		const q = qs[0] as LinkQ
		await db.transaction((tx) =>
			insertCallInTx(tx, {
				userId: ben.id,
				question: q,
				data: {
					questionId: q.id,
					shape: q.shape,
					caseText: "",
					selections: [{ optionId: q.a, conviction: 50 }],
				} as Parameters<typeof insertCallInTx>[1]["data"],
			}),
		)
	})

	it("blocks a redo on a call that's a link", async () => {
		const { calls } = await threeLinkChain()
		await expect(
			db.transaction((tx) =>
				assertNotActiveLink(tx, (calls[1] as { id: string }).id),
			),
		).rejects.toThrow("This call is a link in a chain.")
	})
})

describe("leaving and calling off", () => {
	it("keeps a member's link row when they leave, and tells the rest", async () => {
		const { chain, ben, amy, cara } = await threeLinkChain()
		await db.transaction((tx) => leaveChain(tx, ben, chain.id))
		const links = await linksOf(chain.id)
		expect(links.find((l) => l.userId === ben.id)?.status).toBe("left")
		const told = await db.query.notifications.findMany({
			where: { type: "chain_member_left" },
		})
		expect(told.map((n) => n.userId).sort()).toEqual([amy.id, cara.id].sort())
	})

	it("doesn't let the starter leave their own chain", async () => {
		const { chain, amy } = await threeLinkChain()
		await expect(
			db.transaction((tx) => leaveChain(tx, amy, chain.id)),
		).rejects.toThrow("Call it off instead.")
	})

	it("calls the chain off, freeing every call in it", async () => {
		const { chain, amy, group, calls } = await threeLinkChain()
		await db.transaction((tx) => callOffChain(tx, amy, chain.id))
		const links = await linksOf(chain.id)
		expect(links.every((l) => l.status === "released")).toBe(true)
		const fresh = await db.query.chains.findFirst({ where: { id: chain.id } })
		expect(chainPhase(fresh as typeof chain, links)).toBe("called_off")
		// Free to start a new chain with.
		await start(amy, group.id, (calls[0] as { id: string }).id)
	})

	it("takes a member's links out when they leave the group before lock", async () => {
		const { chain, ben, group } = await threeLinkChain()
		await db.transaction((tx) => releaseLinksOnLeave(tx, ben, group.id))
		const links = await linksOf(chain.id)
		expect(links.find((l) => l.userId === ben.id)?.status).toBe("left")
	})
})

describe("settling a chain", () => {
	it("multiplies every win when every link hits", async () => {
		const { chain, qs, amy, ben, cara } = await threeLinkChain()
		for (const q of qs) await settle(q, "a")
		await drainChainRecomputes()

		// Each member's multiplier is 4x for two other coin flips, times 1.1:
		// 4.4x, so the award is 3.4 times their win of 150, 90 and 45.
		const awards = await awardsOf(chain.id)
		expect(awards.get(amy.id)).toBe(510)
		expect(awards.get(ben.id)).toBe(306)
		expect(awards.get(cara.id)).toBe(153)
		expect(await bonusOf(amy.id)).toBe(510)
		const notices = await db.query.notifications.findMany({
			where: { type: "chain_settled" },
		})
		expect(notices).toHaveLength(3)
	})

	it("takes back every hit when a link misses", async () => {
		const { chain, qs, amy, ben, cara } = await threeLinkChain()
		await settle(qs[0] as LinkQ, "a")
		await settle(qs[1] as LinkQ, "b")
		await settle(qs[2] as LinkQ, "a")
		await drainChainRecomputes()

		const awards = await awardsOf(chain.id)
		expect(awards.get(amy.id)).toBe(-150)
		expect(awards.has(ben.id)).toBe(false)
		expect(awards.get(cara.id)).toBe(-45)
		const fresh = await db.query.chains.findFirst({ where: { id: chain.id } })
		const benLink = (await linksOf(chain.id)).find((l) => l.userId === ben.id)
		expect(fresh?.announcedBreakerLinkId).toBe(benLink?.id)
	})

	it("doesn't tell anyone twice when a rebuild finds nothing new", async () => {
		const { qs } = await threeLinkChain()
		for (const q of qs) await settle(q, "a")
		await drainChainRecomputes()
		await settle(qs[0] as LinkQ, "a")
		await drainChainRecomputes()
		const notices = await db.query.notifications.findMany({
			where: { type: "chain_settled" },
		})
		expect(notices).toHaveLength(3)
		expect(notices.every((n) => n.readAt === null)).toBe(true)
	})

	it("moves the points when a result is overturned", async () => {
		const { chain, qs, amy } = await threeLinkChain()
		for (const q of qs) await settle(q, "a")
		await drainChainRecomputes()
		expect((await awardsOf(chain.id)).get(amy.id)).toBe(510)

		await settle(qs[2] as LinkQ, "b")
		await drainChainRecomputes()
		expect((await awardsOf(chain.id)).get(amy.id)).toBe(-150)
		expect(await bonusOf(amy.id)).toBe(-150)
	})

	it("drops a voided link and multiplies without it", async () => {
		const { chain, qs, amy } = await threeLinkChain()
		const voided = qs[2] as LinkQ
		await db.transaction((tx) =>
			markQuestionVoided(tx, voided, {
				reason: "game_not_completed",
				note: "",
				voidedBy: { method: "system" },
			}),
		)
		await settle(qs[0] as LinkQ, "a")
		await settle(qs[1] as LinkQ, "a")
		await drainChainRecomputes()
		// One other coin flip left: 2.2x, an award of 1.2 times the win.
		expect((await awardsOf(chain.id)).get(amy.id)).toBe(180)
	})

	it("awards nothing for a chain that locks with one link", async () => {
		const league = await makeLeague()
		const amy = await makeUser()
		const group = await makeGroup({ admin: amy })
		const q = await linkQuestion(league.id)
		const chain = await start(amy, group.id, (await callOn(q, amy, "a")).id)
		await settle(q, "a")
		await drainChainRecomputes()
		expect((await awardsOf(chain.id)).size).toBe(0)
		const rows = await db.select().from(pointAwards)
		expect(rows).toHaveLength(0)
	})
})

describe("a link's question deleted outright", () => {
	it("drops the link and reprices the rest", async () => {
		const { chain, qs, amy } = await threeLinkChain()
		for (const q of qs) await settle(q, "a")
		await drainChainRecomputes()
		expect((await awardsOf(chain.id)).get(amy.id)).toBe(510)

		const gone = qs[2] as LinkQ
		await db.transaction(async (tx) => {
			await markChainsDirty(tx, gone)
			await tx.delete(questions).where(eq(questions.id, gone.id))
		})
		await drainChainRecomputes()
		expect((await awardsOf(chain.id)).get(amy.id)).toBe(180)
	})
})

describe("the thread", () => {
	it("tells who joined and how it moved the viewer's multiplier", async () => {
		const { chain, amy } = await threeLinkChain()
		const events = chainTimeline({
			chain,
			links: await linksOf(chain.id),
			viewerId: amy.id,
		})
		expect(events.map((e) => e.kind)).toEqual(["started", "joined", "joined"])
		expect(events[2]).toMatchObject({ linkCount: 3 })
		expect(events[2]?.previousViewerMultiplier).toBeCloseTo(2.2)
		expect(events[2]?.viewerMultiplier).toBeCloseTo(4.4)
	})

	it("posts a decline and a leave", async () => {
		const league = await makeLeague()
		const [amy, ben, cara] = [
			await makeUser(),
			await makeUser(),
			await makeUser(),
		]
		const group = await makeGroup({ admin: amy, members: [ben, cara] })
		const chain = await start(
			amy,
			group.id,
			(await callOn(await linkQuestion(league.id), amy, "a")).id,
		)
		await request(
			ben,
			chain.id,
			(await callOn(await linkQuestion(league.id), ben, "a")).id,
		)
		await decide(amy, await pendingLinkId(chain.id, ben.id), false)
		await request(
			cara,
			chain.id,
			(await callOn(await linkQuestion(league.id), cara, "a")).id,
		)
		await decide(amy, await pendingLinkId(chain.id, cara.id))
		await db.transaction((tx) => leaveChain(tx, cara, chain.id))

		const events = chainTimeline({
			chain,
			links: await linksOf(chain.id),
			viewerId: amy.id,
		})
		expect(events.map((e) => e.kind)).toEqual([
			"started",
			"declined",
			"joined",
			"left",
		])
		expect(events[3]).toMatchObject({ actorId: cara.id, viewerMultiplier: 1 })
		expect(events[3]?.previousViewerMultiplier).toBeCloseTo(2.2)
	})

	it("ends with the break, after the links that landed", async () => {
		const { chain, qs, ben } = await threeLinkChain()
		await settle(qs[0] as LinkQ, "a")
		await settle(qs[1] as LinkQ, "b")
		const events = chainTimeline({
			chain,
			links: await linksOf(chain.id),
			viewerId: null,
		})
		const kinds = events.map((e) => e.kind)
		expect(kinds.slice(3)).toEqual([
			"locked",
			"link_hit",
			"link_missed",
			"broken",
		])
		expect(events.at(-1)).toMatchObject({ actorId: ben.id, zeroedCount: 1 })
	})
})

describe("the chain's push", () => {
	it("shares its settling game's key and tells the result", async () => {
		const { qs, cara } = await threeLinkChain()
		await settle(qs[0] as LinkQ, "a")
		await settle(qs[1] as LinkQ, "b")
		await drainChainRecomputes()

		const notice = await db.query.notifications.findFirst({
			where: { userId: cara.id, type: "chain_settled" },
		})
		if (!notice) throw new Error("no notice")
		expect(collapseKeyFor(notice)).toBe(`game:${(qs[1] as LinkQ).game.id}`)
		const content = await buildPushContent(notice)
		expect(content?.body).toMatch(/^@\S+ broke the chain\.$/)
	})

	it("rides along on the game's own results push", async () => {
		const { qs, ben } = await threeLinkChain()
		await settle(qs[0] as LinkQ, "a")
		await settle(qs[1] as LinkQ, "b")
		await drainChainRecomputes()

		const results = await db.query.notifications.findFirst({
			where: { userId: ben.id, type: "game_resolved" },
		})
		if (!results) throw new Error("no results notice")
		const content = await buildPushContent(results)
		expect(content?.body).toBe(
			"Your call missed. -86 pts. You broke the chain.",
		)
	})
})
