import { and, eq, inArray, isNull, max } from "drizzle-orm"
import { db } from "../../db"
import { posts, redraftPicks } from "../../db/schema"

// What the crowd's redraft of a class looks like, slot by slot: of the
// public answers long enough to reach a slot, how many put each player
// there. A Top 5 says nothing about pick 12, so it isn't counted against
// anyone there. Group answers stay inside their group and removed ones are
// gone, so neither counts.
export type SlotConsensus = {
	// The public answers that reach this slot.
	answers: number
	// Every player put here, most often first. Ties go to whoever was put
	// here first, so the order doesn't shuffle between reads.
	picks: { playerId: string; count: number; share: number }[]
}

export type RedraftConsensus = {
	answerCount: number
	slots: Map<number, SlotConsensus>
}

const publicAnswer = (promptIds: string[]) =>
	and(
		inArray(posts.promptId, promptIds),
		isNull(posts.groupId),
		isNull(posts.removedAt),
	)

export async function redraftConsensus(
	promptIds: string[],
): Promise<Map<string, RedraftConsensus>> {
	const result = new Map<string, RedraftConsensus>(
		promptIds.map((id) => [id, { answerCount: 0, slots: new Map() }]),
	)
	if (promptIds.length === 0) return result

	const [lengths, picks] = await Promise.all([
		db
			.select({
				promptId: posts.promptId,
				length: max(redraftPicks.slot),
			})
			.from(posts)
			.innerJoin(redraftPicks, eq(redraftPicks.postId, posts.id))
			.where(publicAnswer(promptIds))
			.groupBy(posts.promptId, posts.id),
		db
			.select({
				promptId: posts.promptId,
				slot: redraftPicks.slot,
				playerId: redraftPicks.playerId,
			})
			.from(redraftPicks)
			.innerJoin(posts, eq(posts.id, redraftPicks.postId))
			.where(publicAnswer(promptIds))
			.orderBy(posts.createdAt, posts.id),
	])

	// How many answers reach each slot, from each answer's length.
	const reach = new Map<string, number[]>()
	for (const row of lengths) {
		const entry = result.get(row.promptId)
		if (!entry) continue
		entry.answerCount++
		const byLength = reach.get(row.promptId) ?? []
		byLength.push(row.length ?? 0)
		reach.set(row.promptId, byLength)
	}

	// Insertion order is first-picked order, which settles ties below.
	const counts = new Map<string, Map<number, Map<string, number>>>()
	for (const row of picks) {
		const bySlot = counts.get(row.promptId) ?? new Map()
		const byPlayer = bySlot.get(row.slot) ?? new Map<string, number>()
		byPlayer.set(row.playerId, (byPlayer.get(row.playerId) ?? 0) + 1)
		bySlot.set(row.slot, byPlayer)
		counts.set(row.promptId, bySlot)
	}

	for (const [promptId, bySlot] of counts) {
		const entry = result.get(promptId)
		if (!entry) continue
		const answerLengths = reach.get(promptId) ?? []
		for (const [slot, byPlayer] of bySlot) {
			const answers = answerLengths.filter((length) => length >= slot).length
			if (answers === 0) continue
			entry.slots.set(slot, {
				answers,
				picks: [...byPlayer.entries()]
					.map(([playerId, n], order) => ({ playerId, count: n, order }))
					.sort((a, b) => b.count - a.count || a.order - b.order)
					.map(({ playerId, count: n }) => ({
						playerId,
						count: n,
						share: n / answers,
					})),
			})
		}
	}
	return result
}

// The share of answers reaching this slot that put this player in it.
export function slotShare(
	consensus: RedraftConsensus | undefined,
	slot: number,
	playerId: string,
): number {
	return (
		consensus?.slots.get(slot)?.picks.find((pick) => pick.playerId === playerId)
			?.share ?? 0
	)
}

export type CrowdPick = { slot: number; playerId: string; share: number }

// The crowd's redraft: slot by slot from the top, the player most often put
// there who isn't already taken higher. A slot nobody has reached, or whose
// every pick went higher, is left out.
export function crowdRedraft(
	consensus: RedraftConsensus,
	length: number,
): CrowdPick[] {
	const taken = new Set<string>()
	const out: CrowdPick[] = []
	for (let slot = 1; slot <= length; slot++) {
		const pick = consensus.slots
			.get(slot)
			?.picks.find((candidate) => !taken.has(candidate.playerId))
		if (!pick) continue
		taken.add(pick.playerId)
		out.push({ slot, playerId: pick.playerId, share: pick.share })
	}
	return out
}
