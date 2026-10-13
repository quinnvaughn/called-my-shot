import { db } from "../../../db"
import type { Challenge, ChallengeAcceptance } from "../../../db/schema"
import { loadChallengeQuestionFacts } from "../../../lib/challenges/load"
import {
	buildMatchups,
	type ChallengePoints,
	type ChallengeQuestionFacts,
	type ChallengeState,
	challengeState,
	loadChallengePoints,
	type Matchup,
} from "../../../lib/challenges/outcome"
import { ctxLoader, groupByKey } from "../../loader"

// Everything a challenge's fields read, worked out once per request: its
// questions, its state, and every 1v1 in it with the points on each side.
export type ChallengeView = {
	challenge: Challenge
	questions: ChallengeQuestionFacts[]
	state: ChallengeState
	// The creator's points on each question, with or without a 1v1 to put
	// them in.
	creatorPoints: ChallengePoints
	matchups: Matchup<ChallengeAcceptance>[]
}

export const challengeViewLoader = ctxLoader(
	async (challenges: Challenge[]): Promise<ChallengeView[]> => {
		const ids = challenges.map((c) => c.id)
		const [facts, acceptances] = await Promise.all([
			loadChallengeQuestionFacts(ids),
			db.query.challengeAcceptances.findMany({
				where: { challengeId: { in: ids } },
				orderBy: { createdAt: "asc" },
			}),
		])
		const acceptancesById = groupByKey(ids, acceptances, (a) => a.challengeId)
		const pointsOf = await loadChallengePoints(ids, [
			...new Set([
				...challenges.map((c) => c.creatorId),
				...acceptances.map((a) => a.acceptorId),
			]),
		])
		return challenges.map((challenge, i) => {
			const questions = facts.get(challenge.id) ?? []
			const state = challengeState(questions)
			return {
				challenge,
				questions,
				state,
				creatorPoints: pointsOf(challenge.id, challenge.creatorId),
				matchups: buildMatchups({
					challengeId: challenge.id,
					creatorId: challenge.creatorId,
					state,
					acceptances: acceptancesById[i] ?? [],
					pointsOf,
				}),
			}
		})
	},
	{ cacheKeyFn: (challenge) => challenge.id },
)
