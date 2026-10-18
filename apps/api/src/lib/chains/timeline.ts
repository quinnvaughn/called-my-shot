import { chainMultiplier, computeChain } from "@called-my-shot/scoring"
import type { Chain } from "../../db/schema"
import { type LoadedLink, linkFacts, linkOutcome } from "./load"
import { chainLocksAt, isChainOpen } from "./state"

// What happened to a chain, as its page lists it: every change to who's in it,
// the lock, each link landing, and how it ended. Built from the rows
// themselves rather than a log, so an overturned result rewrites the story
// along with the points. The words are the web's; this says what happened
// and to whom.

export type ChainEventKind =
	| "started"
	| "joined"
	| "declined"
	| "left"
	| "called_off"
	| "locked"
	| "link_hit"
	| "link_missed"
	| "broken"
	| "held"

export type ChainEvent = {
	kind: ChainEventKind
	at: Date
	actorId: string | null
	linkId: string | null
	// How many links the chain has once this happened. Set on started, joined,
	// left and locked.
	linkCount: number | null
	// The viewer's own multiplier after this happened, and before it, when the
	// viewer is in the chain and it moved. Set on joined and left (both), and
	// on locked (after only).
	viewerMultiplier: number | null
	previousViewerMultiplier: number | null
	// How many hits a break zeroed. Set on broken.
	zeroedCount: number | null
}

const event = (
	kind: ChainEventKind,
	at: Date,
	fields: Partial<Omit<ChainEvent, "kind" | "at">> = {},
): ChainEvent => ({
	kind,
	at,
	actorId: null,
	linkId: null,
	linkCount: null,
	viewerMultiplier: null,
	previousViewerMultiplier: null,
	zeroedCount: null,
	...fields,
})

// A link that was ever in the chain, as opposed to a request that never got
// a yes: only those carry a decidedAt and end up approved, left or released.
const wasApproved = (link: LoadedLink) =>
	link.decidedAt !== null &&
	(link.status === "approved" ||
		link.status === "left" ||
		link.status === "released")

// The links in the chain just after `at`.
function inChainAfter(links: LoadedLink[], at: Date): LoadedLink[] {
	return links.filter(
		(link) =>
			wasApproved(link) &&
			link.decidedAt !== null &&
			link.decidedAt <= at &&
			(link.leftAt === null || link.leftAt > at),
	)
}

function multiplierFor(
	viewerId: string | null,
	links: LoadedLink[],
): number | null {
	if (!viewerId || !links.some((link) => link.userId === viewerId)) return null
	return chainMultiplier(
		links.filter((link) => link.userId !== viewerId).map((l) => l.hitChance),
	)
}

const realizedAt = (link: LoadedLink) =>
	link.game.finalizedAt ?? link.game.startsAt

export function chainTimeline(input: {
	chain: Pick<Chain, "createdAt" | "cancelledAt" | "starterId">
	links: LoadedLink[]
	viewerId: string | null
	now?: Date
}): ChainEvent[] {
	const { chain, links, viewerId } = input
	const now = input.now ?? new Date()
	const events: ChainEvent[] = []

	const starterLink = links.find(
		(link) => link.userId === chain.starterId && wasApproved(link),
	)
	events.push(
		event("started", chain.createdAt, {
			actorId: chain.starterId,
			linkId: starterLink?.id ?? null,
			linkCount: 1,
		}),
	)

	for (const link of links) {
		if (link === starterLink) continue
		if (wasApproved(link) && link.decidedAt) {
			const after = inChainAfter(links, link.decidedAt)
			const before = after.filter((l) => l.id !== link.id)
			const viewerMoved = viewerId !== link.userId
			events.push(
				event("joined", link.decidedAt, {
					actorId: link.userId,
					linkId: link.id,
					linkCount: after.length,
					viewerMultiplier: viewerMoved ? multiplierFor(viewerId, after) : null,
					previousViewerMultiplier: viewerMoved
						? multiplierFor(viewerId, before)
						: null,
				}),
			)
		}
		if (link.status === "declined" && link.decidedAt) {
			events.push(
				event("declined", link.decidedAt, {
					actorId: chain.starterId,
					linkId: link.id,
				}),
			)
		}
		if (link.status === "left" && wasApproved(link) && link.leftAt) {
			const after = inChainAfter(links, link.leftAt)
			const viewerMoved = viewerId !== link.userId
			events.push(
				event("left", link.leftAt, {
					actorId: link.userId,
					linkId: link.id,
					linkCount: after.length,
					viewerMultiplier: viewerMoved ? multiplierFor(viewerId, after) : null,
					previousViewerMultiplier: viewerMoved
						? multiplierFor(viewerId, [...after, link])
						: null,
				}),
			)
		}
	}

	if (chain.cancelledAt) {
		events.push(
			event("called_off", chain.cancelledAt, { actorId: chain.starterId }),
		)
		return sortEvents(events)
	}

	const locksAt = chainLocksAt(links)
	if (!locksAt || isChainOpen(chain, links, now)) return sortEvents(events)
	const approved = links.filter((link) => link.status === "approved")
	events.push(
		event("locked", locksAt, {
			linkCount: approved.length,
			viewerMultiplier: multiplierFor(viewerId, approved),
		}),
	)

	for (const link of approved) {
		const outcome = linkOutcome(link)
		if (outcome !== "hit" && outcome !== "miss") continue
		events.push(
			event(outcome === "hit" ? "link_hit" : "link_missed", realizedAt(link), {
				actorId: link.userId,
				linkId: link.id,
			}),
		)
	}

	const result = computeChain(approved.map(linkFacts))
	if (result.state === "broken" && result.breakerLinkId) {
		const breaker = approved.find((link) => link.id === result.breakerLinkId)
		if (breaker) {
			events.push(
				event("broken", realizedAt(breaker), {
					actorId: breaker.userId,
					linkId: breaker.id,
					zeroedCount: result.awards.length,
				}),
			)
		}
	}
	if (result.state === "held") {
		const last = Math.max(...approved.map((link) => realizedAt(link).getTime()))
		events.push(event("held", new Date(last)))
	}
	return sortEvents(events)
}

// Oldest first. Things that happen at one instant read in the order they
// follow from each other: a link landing before the break it caused.
const ORDER: Record<ChainEventKind, number> = {
	started: 0,
	joined: 1,
	declined: 1,
	left: 1,
	called_off: 2,
	locked: 3,
	link_hit: 4,
	link_missed: 4,
	broken: 5,
	held: 5,
}

function sortEvents(events: ChainEvent[]): ChainEvent[] {
	return events.sort(
		(a, b) => a.at.getTime() - b.at.getTime() || ORDER[a.kind] - ORDER[b.kind],
	)
}
