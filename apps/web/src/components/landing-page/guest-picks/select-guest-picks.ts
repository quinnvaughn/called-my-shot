import type { QuestionShape } from "#/graphql/generated/graphql"

export const GUEST_PICK_COUNT = 3

// A pick has to survive the visitor filling in the sign-up form after making
// it, and the API refuses a call once its question's lock time has passed.
export const MIN_LEAD_MS = 20 * 60 * 1000

export type GuestPickCandidate = {
	id: string
	shape: QuestionShape
	locksAt: string
	league: { id: string }
}

// Orders the landing page's candidate questions for the hero stack. The first
// GUEST_PICK_COUNT are the cards the visitor walks through; the rest back the
// Skip button. Leagues take turns, soonest-locking first within each, so one
// busy slate doesn't crowd out another sport. The opening cards hold at most one
// game-winner, so a stat line or prop shows up alongside it.
export function orderGuestPicks<T extends GuestPickCandidate>(
	candidates: T[],
	now: number,
): T[] {
	const eligible = candidates
		.filter((q) => Date.parse(q.locksAt) - now >= MIN_LEAD_MS)
		.sort((a, b) => Date.parse(a.locksAt) - Date.parse(b.locksAt))

	const byLeague = new Map<string, T[]>()
	for (const question of eligible) {
		const queue = byLeague.get(question.league.id)
		if (queue) queue.push(question)
		else byLeague.set(question.league.id, [question])
	}

	const queues = [...byLeague.values()]
	const interleaved: T[] = []
	for (let round = 0; interleaved.length < eligible.length; round++) {
		for (const queue of queues) {
			const question = queue[round]
			if (question) interleaved.push(question)
		}
	}

	const opening: T[] = []
	const deferred: T[] = []
	for (const question of interleaved) {
		if (opening.length === GUEST_PICK_COUNT) break
		const isSecondWinner =
			question.shape === "TEAM_VS_TEAM" &&
			opening.some((q) => q.shape === "TEAM_VS_TEAM")
		if (isSecondWinner) deferred.push(question)
		else opening.push(question)
	}
	// Only game-winners left to fill with: a second one beats a short stack.
	for (const question of deferred) {
		if (opening.length === GUEST_PICK_COUNT) break
		opening.push(question)
	}

	const openingIds = new Set(opening.map((q) => q.id))
	return [...opening, ...interleaved.filter((q) => !openingIds.has(q.id))]
}
