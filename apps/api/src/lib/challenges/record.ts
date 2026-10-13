import { and, eq, or } from "drizzle-orm"
import { match } from "ts-pattern"
import { db } from "../../db"
import { challengeAcceptances, challenges } from "../../db/schema"
import type { DbOrTx } from "../../db/types"
import { loadChallengeQuestionFacts } from "./load"
import {
	challengeState,
	loadChallengePoints,
	matchupOutcome,
	type Record3,
} from "./outcome"

// `userId`'s record against `opponentId` across every settled challenge
// between them, whichever of the two made it.
export async function headToHead(
	userId: string,
	opponentId: string,
	executor: DbOrTx = db,
): Promise<Record3> {
	const pairs = await executor
		.select({
			challengeId: challenges.id,
			creatorId: challenges.creatorId,
			acceptorId: challengeAcceptances.acceptorId,
		})
		.from(challengeAcceptances)
		.innerJoin(challenges, eq(challenges.id, challengeAcceptances.challengeId))
		.where(
			or(
				and(
					eq(challenges.creatorId, userId),
					eq(challengeAcceptances.acceptorId, opponentId),
				),
				and(
					eq(challenges.creatorId, opponentId),
					eq(challengeAcceptances.acceptorId, userId),
				),
			),
		)

	const record = { wins: 0, losses: 0, draws: 0 }
	if (pairs.length === 0) return record

	const challengeIds = pairs.map((p) => p.challengeId)
	const facts = await loadChallengeQuestionFacts(challengeIds, executor)
	const pointsOf = await loadChallengePoints(
		challengeIds,
		[userId, opponentId],
		executor,
	)
	for (const pair of pairs) {
		if (challengeState(facts.get(pair.challengeId) ?? []) !== "settled") {
			continue
		}
		const mine = pointsOf(pair.challengeId, userId).total
		const theirs = pointsOf(pair.challengeId, opponentId).total
		match(matchupOutcome(mine, theirs))
			.with("creator", () => record.wins++)
			.with("acceptor", () => record.losses++)
			.with("draw", () => record.draws++)
			.exhaustive()
	}
	return record
}
