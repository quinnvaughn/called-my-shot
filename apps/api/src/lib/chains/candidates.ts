import { and, desc, eq, gt, inArray } from "drizzle-orm"
import { db } from "../../db"
import { calls, chainLinks, questions } from "../../db/schema"
import { getTrackedLeagueIds } from "../groups"
import {
	ineligibleReason,
	linkHitChance,
	loadCandidateCall,
} from "./eligibility"
import { hedgeAgainstLinks, hedgeAgainstPick } from "./hedge"
import type { LoadedLink } from "./load"
import { approvedLinks } from "./state"

export type LinkCandidate = {
	callId: string
	hitChance: number | null
	// Why this call can't go in, or null when it can.
	reason: string | null
}

// How many of the viewer's open calls the picker lists.
const CANDIDATE_LIMIT = 50

// The viewer's calls still open to be called, each with whether it can be a
// link: in a new chain when `links` is null, or in the chain those links
// make up. Newest first, so the call they just made is at the top.
export async function linkCandidates(input: {
	userId: string
	groupId: string
	links: LoadedLink[] | null
	now?: Date
}): Promise<LinkCandidate[]> {
	const now = input.now ?? new Date()
	const rows = await db
		.select({ id: calls.id })
		.from(calls)
		.innerJoin(questions, eq(questions.id, calls.questionId))
		.where(
			and(
				eq(calls.userId, input.userId),
				eq(questions.status, "open"),
				gt(questions.locksAt, now),
			),
		)
		.orderBy(desc(calls.createdAt))
		.limit(CANDIDATE_LIMIT)
	if (rows.length === 0) return []

	const tracked = await getTrackedLeagueIds(input.groupId)
	const callIds = rows.map((row) => row.id)
	const held = await db
		.select({ callId: chainLinks.callId })
		.from(chainLinks)
		.where(
			and(
				inArray(chainLinks.callId, callIds),
				inArray(chainLinks.status, ["requested", "approved"]),
			),
		)
	const inAChain = new Set(held.map((row) => row.callId))
	const approved = input.links
		? approvedLinks(input.links).filter((link) => link.userId !== input.userId)
		: []

	const candidates: LinkCandidate[] = []
	for (const { id } of rows) {
		const call = await loadCandidateCall(db, id)
		if (!call) continue
		const selection = call.selections[0]
		const hitChance =
			selection && call.selections.length === 1
				? linkHitChance(call.question, selection)
				: null
		const reason =
			ineligibleReason(call, tracked, now) ??
			(inAChain.has(id) ? "That call is already a link in a chain." : null) ??
			(approved.some((link) => link.questionId === call.question.id)
				? "Someone in this chain already has that question."
				: null) ??
			(approved.some((link) => link.gameId === call.gameId)
				? "That game is already in this chain."
				: null) ??
			(await hedgeReason(
				input.userId,
				approved,
				call.question.id,
				selection?.optionId,
			))
		candidates.push({ callId: id, hitChance, reason })
	}
	return candidates
}

async function hedgeReason(
	userId: string,
	approved: LoadedLink[],
	questionId: string,
	optionId: string | undefined,
): Promise<string | null> {
	if (approved.length === 0 || !optionId) return null
	if (await hedgeAgainstLinks(db, userId, approved)) {
		return "You have the other side of a link already in this chain."
	}
	const opposite = await hedgeAgainstPick(
		db,
		approved.map((link) => link.userId),
		{ userId, questionId, optionId },
	)
	return opposite
		? "Someone in this chain has the other side of that pick."
		: null
}
