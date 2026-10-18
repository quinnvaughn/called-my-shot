import {
	type RequestChainLinkInput,
	requestChainLinkSchema,
	type StartChainInput,
	startChainSchema,
} from "@called-my-shot/schemas"
import { CHAIN_MAX_LINKS } from "@called-my-shot/scoring"
import { and, eq, inArray } from "drizzle-orm"
import { type Chain, chainLinks, chains, type User } from "../../db/schema"
import type { Tx } from "../../db/types"
import { enqueueAnalyticsEvents } from "../analytics-outbox"
import { AuthorizationError, NotFoundError, ValidationError } from "../errors"
import { getTrackedLeagueIds } from "../groups"
import { createNotifications } from "../notifications"
import {
	ineligibleReason,
	linkHitChance,
	loadCandidateCall,
} from "./eligibility"
import { hedgeAgainstLinks, hedgeAgainstPick } from "./hedge"
import { type LoadedLink, loadChainLinks } from "./load"
import { approvedLinks, isChainOpen } from "./state"

type Actor = Pick<User, "id" | "username">

const ACTIVE = ["requested", "approved"] as const

async function lockChain(tx: Tx, chainId: string): Promise<Chain> {
	const [chain] = await tx
		.select()
		.from(chains)
		.where(eq(chains.id, chainId))
		.for("update")
	if (!chain) throw new NotFoundError("That chain doesn't exist.")
	return chain
}

async function groupOf(tx: Tx, groupId: string) {
	const group = await tx.query.groups.findFirst({
		where: { id: groupId },
		columns: { id: true, name: true },
	})
	if (!group) throw new NotFoundError("That group doesn't exist.")
	return group
}

async function isMember(tx: Tx, groupId: string, userId: string) {
	const row = await tx.query.groupMembers.findFirst({
		where: { groupId, userId },
		columns: { id: true },
	})
	return row !== undefined
}

async function requireMember(tx: Tx, groupId: string, userId: string) {
	if (!(await isMember(tx, groupId, userId))) {
		throw new AuthorizationError("You're not a member of this group.")
	}
}

async function linksOf(tx: Tx, chainId: string): Promise<LoadedLink[]> {
	return (await loadChainLinks([chainId], tx)).get(chainId) ?? []
}

function requireOpen(chain: Chain, links: LoadedLink[]) {
	if (!isChainOpen(chain, links)) {
		throw ValidationError.field(
			null,
			chain.cancelledAt
				? "This chain was called off."
				: "This chain has locked. Links have to be in before its first game.",
		)
	}
}

// A call checked as a link: the caller's own, a pick a chain can carry, and
// not holding a place in any other chain. `ownLinkId` is the request being
// approved, which is the one place the call is allowed to hold already.
// Returns it with its chance, read fresh.
async function linkableCall(
	tx: Tx,
	userId: string,
	groupId: string,
	callId: string,
	ownLinkId?: string,
) {
	const call = await loadCandidateCall(tx, callId)
	if (!call) throw new NotFoundError("That call doesn't exist.")
	if (call.userId !== userId) {
		throw new AuthorizationError("That isn't your call.")
	}
	const reason = ineligibleReason(call, await getTrackedLeagueIds(groupId))
	if (reason) throw ValidationError.field("callId", reason)
	const selection = call.selections[0]
	const hitChance = selection ? linkHitChance(call.question, selection) : null
	if (!selection || hitChance === null || !call.gameId) {
		throw ValidationError.field("callId", "This pick has no odds to chain on.")
	}
	const elsewhere = await tx.query.chainLinks.findFirst({
		where: {
			callId,
			status: { in: [...ACTIVE] },
			...(ownLinkId ? { id: { ne: ownLinkId } } : {}),
		},
		columns: { id: true },
	})
	if (elsewhere) {
		throw ValidationError.field(
			"callId",
			"That call is already a link in another chain.",
		)
	}
	return { call, optionId: selection.optionId, hitChance, gameId: call.gameId }
}

// Checks a link against the chain's approved ones: room left, a question and
// a game nobody else has, and no one on either side of it holding the other
// side.
async function assertFits(
	tx: Tx,
	links: LoadedLink[],
	candidate: {
		userId: string
		questionId: string
		gameId: string
		optionId: string
	},
) {
	const approved = approvedLinks(links).filter(
		(link) => link.userId !== candidate.userId,
	)
	if (approved.length >= CHAIN_MAX_LINKS) {
		throw ValidationError.field(
			null,
			`A chain holds up to ${CHAIN_MAX_LINKS} links.`,
		)
	}
	if (approved.some((link) => link.questionId === candidate.questionId)) {
		throw ValidationError.field(
			"callId",
			"Someone in this chain already has that question.",
		)
	}
	if (approved.some((link) => link.gameId === candidate.gameId)) {
		throw ValidationError.field(
			"callId",
			"Every link has to be in a different game, and that one's taken.",
		)
	}
	const theirs = await hedgeAgainstLinks(tx, candidate.userId, approved)
	if (theirs) {
		throw ValidationError.field(
			"callId",
			"You have the other side of a link already in this chain.",
		)
	}
	const opposite = await hedgeAgainstPick(
		tx,
		approved.map((link) => link.userId),
		candidate,
	)
	if (opposite) {
		throw ValidationError.field(
			"callId",
			"Someone in this chain has the other side of that pick.",
		)
	}
}

// Everyone with a place in the chain right now, approved or waiting.
const activeMembers = (links: LoadedLink[]) => [
	...new Set(
		links
			.filter((link) => (ACTIVE as readonly string[]).includes(link.status))
			.map((link) => link.userId),
	),
]

export async function startChain(
	tx: Tx,
	user: Actor,
	input: StartChainInput,
): Promise<Chain> {
	const parsed = startChainSchema.safeParse(input)
	if (!parsed.success) throw ValidationError.fromZodIssues(parsed.error.issues)
	const { groupId, callId } = parsed.data
	await groupOf(tx, groupId)
	await requireMember(tx, groupId, user.id)
	const { call, hitChance, gameId } = await linkableCall(
		tx,
		user.id,
		groupId,
		callId,
	)

	const [chain] = await tx
		.insert(chains)
		.values({ groupId, starterId: user.id })
		.returning()
	if (!chain) throw new Error("Chain insert returned nothing")
	const now = new Date()
	await tx.insert(chainLinks).values({
		chainId: chain.id,
		callId: call.id,
		userId: user.id,
		questionId: call.question.id,
		gameId,
		hitChance,
		status: "approved",
		requestedAt: now,
		decidedAt: now,
	})
	await enqueueAnalyticsEvents(tx, [
		{
			event: "chain_started",
			userId: user.id,
			properties: { chainId: chain.id, groupId },
		},
	])
	return chain
}

export async function requestLink(
	tx: Tx,
	user: Actor,
	input: RequestChainLinkInput,
): Promise<void> {
	const parsed = requestChainLinkSchema.safeParse(input)
	if (!parsed.success) throw ValidationError.fromZodIssues(parsed.error.issues)
	const chain = await lockChain(tx, parsed.data.chainId)
	await requireMember(tx, chain.groupId, user.id)
	const links = await linksOf(tx, chain.id)
	requireOpen(chain, links)

	const own = links.filter((link) => link.userId === user.id)
	if (own.some((link) => link.status === "approved")) {
		throw ValidationError.field(null, "You're already in this chain.")
	}
	if (own.some((link) => link.status === "requested")) {
		throw ValidationError.field(null, "Your link is already waiting on a yes.")
	}
	if (own.some((link) => link.status === "declined")) {
		throw ValidationError.field(
			null,
			"Your link on this chain was already turned down.",
		)
	}

	const { call, optionId, hitChance, gameId } = await linkableCall(
		tx,
		user.id,
		chain.groupId,
		parsed.data.callId,
	)
	await assertFits(tx, links, {
		userId: user.id,
		questionId: call.question.id,
		gameId,
		optionId,
	})

	await tx.insert(chainLinks).values({
		chainId: chain.id,
		callId: call.id,
		userId: user.id,
		questionId: call.question.id,
		gameId,
		hitChance,
	})
	if (chain.starterId) {
		const group = await groupOf(tx, chain.groupId)
		await createNotifications(tx, [
			{
				type: "chain_link_requested",
				userId: chain.starterId,
				chainId: chain.id,
				groupId: group.id,
				groupName: group.name,
				actorId: user.id,
				actorUsername: user.username,
			},
		])
	}
	await enqueueAnalyticsEvents(tx, [
		{
			event: "chain_link_requested",
			userId: user.id,
			properties: { chainId: chain.id, hitChance },
		},
	])
}

export async function decideLink(
	tx: Tx,
	starter: Actor,
	linkId: string,
	approve: boolean,
): Promise<void> {
	const pending = await tx.query.chainLinks.findFirst({ where: { id: linkId } })
	if (!pending) throw new NotFoundError("That request doesn't exist.")
	const chain = await lockChain(tx, pending.chainId)
	if (chain.starterId !== starter.id) {
		throw new AuthorizationError("Only the chain's starter can answer that.")
	}
	const links = await linksOf(tx, chain.id)
	const link = links.find((l) => l.id === linkId)
	if (!link || link.status !== "requested") {
		throw ValidationError.field(null, "That request was already answered.")
	}
	requireOpen(chain, links)

	const now = new Date()
	if (approve) {
		if (!(await isMember(tx, chain.groupId, link.userId))) {
			throw ValidationError.field(null, "They're not in the group anymore.")
		}
		const { optionId, hitChance } = await linkableCall(
			tx,
			link.userId,
			chain.groupId,
			link.callId,
			link.id,
		)
		await assertFits(tx, links, {
			userId: link.userId,
			questionId: link.questionId,
			gameId: link.gameId,
			optionId,
		})
		await tx
			.update(chainLinks)
			.set({ status: "approved", decidedAt: now, hitChance })
			.where(eq(chainLinks.id, link.id))
	} else {
		await tx
			.update(chainLinks)
			.set({ status: "declined", decidedAt: now })
			.where(eq(chainLinks.id, link.id))
	}

	const group = await groupOf(tx, chain.groupId)
	await createNotifications(tx, [
		{
			type: "chain_link_decided",
			userId: link.userId,
			chainId: chain.id,
			groupId: group.id,
			groupName: group.name,
			actorId: starter.id,
			actorUsername: starter.username,
		},
	])
	await enqueueAnalyticsEvents(tx, [
		{
			event: "chain_link_decided",
			userId: starter.id,
			properties: { chainId: chain.id, approved: approve },
		},
	])
}

// A member pulling their link, or their request, before lock. The starter
// can't leave their own chain; they call it off instead.
export async function leaveChain(
	tx: Tx,
	user: Actor,
	chainId: string,
): Promise<void> {
	const chain = await lockChain(tx, chainId)
	if (chain.starterId === user.id) {
		throw ValidationError.field(
			null,
			"You started this chain. Call it off instead.",
		)
	}
	const links = await linksOf(tx, chain.id)
	requireOpen(chain, links)
	const mine = links.find(
		(link) =>
			link.userId === user.id &&
			(ACTIVE as readonly string[]).includes(link.status),
	)
	if (!mine) throw ValidationError.field(null, "You're not in this chain.")
	await releaseLink(tx, chain, links, mine, user, "left")
}

// Takes a link out, and tells everyone still in when it was a link rather
// than a request.
async function releaseLink(
	tx: Tx,
	chain: Chain,
	links: LoadedLink[],
	link: LoadedLink,
	actor: Actor,
	status: "left" | "released",
) {
	await tx
		.update(chainLinks)
		.set({ status, leftAt: new Date() })
		.where(eq(chainLinks.id, link.id))
	if (link.status !== "approved") return
	const group = await groupOf(tx, chain.groupId)
	const stillIn = approvedLinks(links)
		.map((l) => l.userId)
		.filter((id) => id !== link.userId)
	await createNotifications(
		tx,
		stillIn.map((userId) => ({
			type: "chain_member_left" as const,
			userId,
			chainId: chain.id,
			groupId: group.id,
			groupName: group.name,
			actorId: actor.id,
			actorUsername: actor.username,
		})),
	)
	await enqueueAnalyticsEvents(tx, [
		{
			event: "chain_left",
			userId: link.userId,
			properties: { chainId: chain.id },
		},
	])
}

export async function callOffChain(
	tx: Tx,
	starter: Actor,
	chainId: string,
): Promise<void> {
	const chain = await lockChain(tx, chainId)
	if (chain.starterId !== starter.id) {
		throw new AuthorizationError("Only the chain's starter can call it off.")
	}
	const links = await linksOf(tx, chain.id)
	requireOpen(chain, links)
	const now = new Date()
	await tx
		.update(chains)
		.set({ cancelledAt: now })
		.where(eq(chains.id, chain.id))
	await tx
		.update(chainLinks)
		.set({ status: "released", leftAt: now })
		.where(
			and(
				eq(chainLinks.chainId, chain.id),
				inArray(chainLinks.status, [...ACTIVE]),
			),
		)
	const group = await groupOf(tx, chain.groupId)
	await createNotifications(
		tx,
		activeMembers(links)
			.filter((id) => id !== starter.id)
			.map((userId) => ({
				type: "chain_called_off" as const,
				userId,
				chainId: chain.id,
				groupId: group.id,
				groupName: group.name,
				actorId: starter.id,
				actorUsername: starter.username,
			})),
	)
	await enqueueAnalyticsEvents(tx, [
		{
			event: "chain_called_off",
			userId: starter.id,
			properties: { chainId: chain.id, links: approvedLinks(links).length },
		},
	])
}

// A member leaving the group takes their links out of every chain there that
// hasn't locked. A chain already under way keeps them: its result was set
// the moment it locked. A starter leaving calls off their open chains.
export async function releaseLinksOnLeave(
	tx: Tx,
	user: Actor,
	groupId: string,
): Promise<void> {
	const rows = await tx
		.selectDistinct({ chainId: chainLinks.chainId })
		.from(chainLinks)
		.innerJoin(chains, eq(chains.id, chainLinks.chainId))
		.where(
			and(
				eq(chains.groupId, groupId),
				eq(chainLinks.userId, user.id),
				inArray(chainLinks.status, [...ACTIVE]),
			),
		)
	for (const { chainId } of rows.sort((a, b) =>
		a.chainId.localeCompare(b.chainId),
	)) {
		const chain = await lockChain(tx, chainId)
		const links = await linksOf(tx, chain.id)
		if (!isChainOpen(chain, links)) continue
		if (chain.starterId === user.id) {
			await callOffChain(tx, user, chain.id)
			continue
		}
		const mine = links.find(
			(link) =>
				link.userId === user.id &&
				(ACTIVE as readonly string[]).includes(link.status),
		)
		if (mine) await releaseLink(tx, chain, links, mine, user, "left")
	}
}
