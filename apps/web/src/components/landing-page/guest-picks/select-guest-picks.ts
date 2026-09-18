import type { QuestionShape } from "#/graphql/generated/graphql"

export const GUEST_PICK_COUNT = 3

// A pick has to survive the visitor filling in the sign-up form after making
// it, and the API refuses a call once its question's lock time has passed.
export const MIN_LEAD_MS = 20 * 60 * 1000

export type GuestPickLeague = { id: string; abbreviation: string }

export type GuestPickCandidate = {
	id: string
	shape: QuestionShape
	locksAt: string
	league: GuestPickLeague
}

function eligibleQuestions<T extends GuestPickCandidate>(
	candidates: T[],
	now: number,
): T[] {
	return candidates
		.filter((q) => Date.parse(q.locksAt) - now >= MIN_LEAD_MS)
		.sort((a, b) => Date.parse(a.locksAt) - Date.parse(b.locksAt))
}

// The leagues the hero's chip row offers, the one with the soonest-locking
// question first. Only leagues holding a question the visitor could actually
// call are listed, so tapping a chip never lands on an empty stack.
export function guestPickLeagues<T extends GuestPickCandidate>(
	candidates: T[],
	now: number,
): GuestPickLeague[] {
	const byId = new Map<string, GuestPickLeague>()
	for (const question of eligibleQuestions(candidates, now)) {
		if (!byId.has(question.league.id)) {
			byId.set(question.league.id, question.league)
		}
	}
	return [...byId.values()]
}

// Leagues take turns, soonest-locking first within each.
function interleaveByLeague<T extends GuestPickCandidate>(questions: T[]): T[] {
	const byLeague = new Map<string, T[]>()
	for (const question of questions) {
		const queue = byLeague.get(question.league.id)
		if (queue) queue.push(question)
		else byLeague.set(question.league.id, [question])
	}

	const queues = [...byLeague.values()]
	const interleaved: T[] = []
	for (let round = 0; interleaved.length < questions.length; round++) {
		for (const queue of queues) {
			const question = queue[round]
			if (question) interleaved.push(question)
		}
	}
	return interleaved
}

// Fills `opening` from one league's questions, holding it to a single
// game-winner for as long as that same pool has anything else to offer. The
// pool is exhausted before the caller moves on to the next one: a second
// game-winner from the league the visitor chose beats a stat line from a league
// they didn't, which is the whole point of scoping the stack to a league.
function fillOpening<T extends GuestPickCandidate>(pool: T[], opening: T[]) {
	const deferred: T[] = []
	for (const question of pool) {
		if (opening.length === GUEST_PICK_COUNT) return
		const isSecondWinner =
			question.shape === "TEAM_VS_TEAM" &&
			opening.some((q) => q.shape === "TEAM_VS_TEAM")
		if (isSecondWinner) deferred.push(question)
		else opening.push(question)
	}
	for (const question of deferred) {
		if (opening.length === GUEST_PICK_COUNT) return
		opening.push(question)
	}
}

// Orders the landing page's candidate questions for the hero stack. The first
// GUEST_PICK_COUNT are the cards the visitor walks through; the rest back the
// Skip button.
//
// leagueId is the league the chip row has selected. Its questions come first
// and are exhausted before any other league's, so the opening cards are a
// single slate and skipping stays inside it. What's left over takes turns by
// league, which is what fills the stack when the selected league holds fewer
// than GUEST_PICK_COUNT questions of its own rather than showing a short one.
// With no league selected every league takes turns from the start.
//
// The opening cards hold at most one game-winner so a stat line or prop shows
// up alongside it, but only where the selected league has one to give. A league
// whose whole slate is game-winners (any league out of season, where the only
// questions up are for opening night) opens on three of its own rather than
// borrowing variety from a sport the visitor didn't ask for.
export function orderGuestPicks<T extends GuestPickCandidate>(
	candidates: T[],
	now: number,
	leagueId?: string | null,
): T[] {
	const eligible = eligibleQuestions(candidates, now)
	const selected = leagueId
		? eligible.filter((q) => q.league.id === leagueId)
		: []
	const rest = interleaveByLeague(
		eligible.filter((q) => q.league.id !== leagueId),
	)

	const opening: T[] = []
	fillOpening(selected, opening)
	fillOpening(rest, opening)

	const openingIds = new Set(opening.map((q) => q.id))
	return [
		...opening,
		...[...selected, ...rest].filter((q) => !openingIds.has(q.id)),
	]
}

// What a league chip does to the stack the visitor is already partway through.
//
// The slot they're looking at is refilled from the new league, and so is every
// later slot they haven't called yet. Earlier slots keep what they hold, and so
// do later slots already holding a call: GUEST_PICK_COUNT is a total, so a chip
// changes what's left to do and never the record behind them. The visitor stays
// on the same step throughout, which is what separates switching sports from
// starting over.
//
// The one call a chip discards is one sitting in the slot on screen. That is
// the only way to move a pick to a different sport once all three are made and
// the visitor has come back through Change picks.
export function refillSlots(
	slots: string[],
	step: number,
	called: ReadonlySet<string>,
	replacements: string[],
): string[] {
	let taken = 0
	return slots.map((id, index) => {
		const replaceable = index === step || (index > step && !called.has(id))
		const replacement = replaceable ? replacements[taken] : undefined
		if (replacement === undefined) return id
		taken++
		return replacement
	})
}
