import { type ChainResult, computeChain } from "@called-my-shot/scoring"
import type { Chain } from "../../db/schema"
import { type LoadedLink, linkFacts } from "./load"

// open: taking links. live: locked, with a link still to land. held, broken:
// settled either way. void: fewer than two links counted, so it awards
// nothing. called_off: the starter ended it before lock.
export type ChainPhase =
	| "open"
	| "live"
	| "held"
	| "broken"
	| "void"
	| "called_off"

export const approvedLinks = (links: LoadedLink[]) =>
	links.filter((link) => link.status === "approved")

// A chain takes links until the first of its links' questions locks, read
// off locksAt rather than status for the same reason challenges are (see
// challengeClosesAt). A voided question no longer holds the chain open or
// shut.
export function chainLocksAt(links: LoadedLink[]): Date | null {
	const counted = approvedLinks(links).filter(
		(link) => link.question.status !== "voided",
	)
	if (counted.length === 0) return null
	return new Date(
		Math.min(...counted.map((link) => link.question.locksAt.getTime())),
	)
}

// Whether the chain still takes, loses and approves links. Every link's
// question also has to still read open: a schedule refresh can push a locked
// question's locksAt later, and that mustn't reopen a chain already under
// way.
export function isChainOpen(
	chain: Pick<Chain, "cancelledAt">,
	links: LoadedLink[],
	now = new Date(),
): boolean {
	if (chain.cancelledAt) return false
	const locksAt = chainLocksAt(links)
	if (!locksAt) return true
	return (
		now < locksAt &&
		approvedLinks(links).every((link) => link.question.status === "open")
	)
}

export function chainResult(links: LoadedLink[]): ChainResult {
	return computeChain(approvedLinks(links).map(linkFacts))
}

export function chainPhase(
	chain: Pick<Chain, "cancelledAt">,
	links: LoadedLink[],
	now = new Date(),
): ChainPhase {
	if (chain.cancelledAt) return "called_off"
	if (isChainOpen(chain, links, now)) return "open"
	const { state } = chainResult(links)
	return state === "pending" ? "live" : state
}

// Settled one way or the other, which is when what a chain awards is final
// until a result moves.
export const isSettledPhase = (phase: ChainPhase) =>
	phase === "held" || phase === "broken"
