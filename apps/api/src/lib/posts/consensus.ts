import { and, count, eq, inArray, isNull } from "drizzle-orm"
import { db } from "../../db"
import { posts, rushmorePicks } from "../../db/schema"

// What the crowd's Rushmore for a prompt looks like: how many public answers
// there are and how many of them put each player on theirs. Group answers
// stay inside their group and removed ones are gone, so neither counts.
export type PromptConsensus = {
	answerCount: number
	// Every player anyone picked, most picks first. Ties go to the player
	// picked earliest (by the earliest answer, then left to right on it), so
	// the order doesn't shuffle between reads.
	picks: { playerId: string; count: number; share: number }[]
}

export const CONSENSUS_SIZE = 4

const publicAnswer = (promptIds: string[]) =>
	and(
		inArray(posts.promptId, promptIds),
		isNull(posts.groupId),
		isNull(posts.removedAt),
	)

export async function promptConsensus(
	promptIds: string[],
): Promise<Map<string, PromptConsensus>> {
	const result = new Map<string, PromptConsensus>(
		promptIds.map((id) => [id, { answerCount: 0, picks: [] }]),
	)
	if (promptIds.length === 0) return result

	const [answers, picks] = await Promise.all([
		db
			.select({ promptId: posts.promptId, n: count() })
			.from(posts)
			.where(publicAnswer(promptIds))
			.groupBy(posts.promptId),
		db
			.select({
				promptId: posts.promptId,
				playerId: rushmorePicks.playerId,
			})
			.from(rushmorePicks)
			.innerJoin(posts, eq(posts.id, rushmorePicks.postId))
			.where(publicAnswer(promptIds))
			.orderBy(posts.createdAt, posts.id, rushmorePicks.position),
	])

	for (const row of answers) {
		const entry = result.get(row.promptId)
		if (entry) entry.answerCount = row.n
	}

	// Insertion order is first-picked order, which settles ties below.
	const counts = new Map<string, Map<string, number>>()
	for (const row of picks) {
		let byPlayer = counts.get(row.promptId)
		if (!byPlayer) {
			byPlayer = new Map()
			counts.set(row.promptId, byPlayer)
		}
		byPlayer.set(row.playerId, (byPlayer.get(row.playerId) ?? 0) + 1)
	}

	for (const [promptId, byPlayer] of counts) {
		const entry = result.get(promptId)
		if (!entry || entry.answerCount === 0) continue
		const total = entry.answerCount
		entry.picks = [...byPlayer.entries()]
			.map(([playerId, n], order) => ({ playerId, count: n, order }))
			.sort((a, b) => b.count - a.count || a.order - b.order)
			.map(({ playerId, count: n }) => ({
				playerId,
				count: n,
				share: n / total,
			}))
	}
	return result
}

// The four most-picked players: the crowd's Rushmore.
export function consensusTop(consensus: PromptConsensus) {
	return consensus.picks.slice(0, CONSENSUS_SIZE)
}

// A share as the whole percent shown beside a face ("88% have him").
export function sharePercent(share: number): number {
	return Math.round(share * 100)
}
