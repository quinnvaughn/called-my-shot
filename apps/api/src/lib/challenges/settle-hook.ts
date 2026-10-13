import type { Tx } from "../../db/types"
import { createNotifications } from "../notifications"
import { loadChallengeQuestionFacts } from "./load"
import { challengeState } from "./outcome"

// Tells everyone in each challenge holding `questionId` that it's over, for
// the challenges this question's result just finished: every question in
// them now settled, or every one voided. Runs after the question's own
// status is written, which is what challengeState reads.
//
// `changedUserIds` limits it to challenges with someone in them whose result
// on this question actually moved, so a re-resolve that changes nothing
// doesn't announce a result again. Left out, every finished challenge hears.
export async function notifyChallengesSettled(
	tx: Tx,
	questionId: string,
	changedUserIds?: ReadonlySet<string>,
): Promise<void> {
	const links = await tx.query.challengeQuestions.findMany({
		where: { questionId },
		columns: { challengeId: true },
		with: {
			challenge: {
				columns: { id: true, creatorId: true },
				with: { acceptances: { columns: { acceptorId: true } } },
			},
		},
	})
	const withPeople = links.flatMap(({ challenge }) =>
		challenge && challenge.acceptances.length > 0 ? [challenge] : [],
	)
	if (withPeople.length === 0) return

	const facts = await loadChallengeQuestionFacts(
		withPeople.map((c) => c.id),
		tx,
	)
	const notices = withPeople.flatMap((challenge) => {
		const state = challengeState(facts.get(challenge.id) ?? [])
		if (state !== "settled" && state !== "voided") return []
		const people = [
			challenge.creatorId,
			...challenge.acceptances.map((a) => a.acceptorId),
		]
		if (changedUserIds && !people.some((id) => changedUserIds.has(id))) {
			return []
		}
		return people.map((userId) => ({
			type: "challenge_settled" as const,
			userId,
			challengeId: challenge.id,
		}))
	})
	await createNotifications(tx, notices)
}
