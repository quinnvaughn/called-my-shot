import type { QuestionShape } from "#/graphql/generated/graphql"

// A pick has to survive the visitor filling in the sign-up form after making
// it, and the API refuses a call once its question's lock time has passed.
export const MIN_LEAD_MS = 20 * 60 * 1000

// Other games' winners a stack takes on when its own game has no team totals,
// matching the two team totals a full game offers.
const FILLER_WINNERS = 2

export type GuestPickLeague = { id: string; abbreviation: string }

export type GuestPickCandidate = {
	id: string
	shape: QuestionShape
	locksAt: string
	league: GuestPickLeague
	game: { id: string; awayTeam: { id: string } } | null
	subjectTeam: { id: string } | null
}

// One stack of the hero, anchored on a game and its cards in the order they're
// shown. Usually all of them are that game's; see guestPickGames for when they
// aren't.
export type GuestPickGame<T extends GuestPickCandidate> = {
	id: string
	league: GuestPickLeague
	cards: T[]
}

function eligibleQuestions<T extends GuestPickCandidate>(
	candidates: T[],
	now: number,
): T[] {
	return candidates
		.filter((q) => Date.parse(q.locksAt) - now >= MIN_LEAD_MS)
		.sort((a, b) => Date.parse(a.locksAt) - Date.parse(b.locksAt))
}

// A game's cards: who wins first, since it's the easiest call there is to make
// cold, then each team's total of the sport's scoring stat, away team first to
// match the matchup header. A game whose winner isn't callable is no game at
// all: "who wins" is what the stack opens on.
function stackFor<T extends GuestPickCandidate>(questions: T[]): T[] | null {
	const winner = questions.find((q) => q.shape === "TEAM_VS_TEAM")
	if (!winner) return null
	const awayTeamId = winner.game?.awayTeam.id
	const teamTotals = questions
		.filter((q) => q.shape === "TEAM_STAT_OVER_UNDER")
		.filter(
			(q, index, all) =>
				all.findIndex(
					(other) => other.subjectTeam?.id === q.subjectTeam?.id,
				) === index,
		)
		.sort(
			(a, b) =>
				Number(b.subjectTeam?.id === awayTeamId) -
				Number(a.subjectTeam?.id === awayTeamId),
		)
		.slice(0, 2)
	return [winner, ...teamTotals]
}

// Every callable game, soonest first.
function allGames<T extends GuestPickCandidate>(
	candidates: T[],
	now: number,
): GuestPickGame<T>[] {
	const byGame = new Map<string, T[]>()
	for (const question of eligibleQuestions(candidates, now)) {
		if (!question.game) continue
		const group = byGame.get(question.game.id)
		if (group) group.push(question)
		else byGame.set(question.game.id, [question])
	}

	const games: GuestPickGame<T>[] = []
	for (const [id, questions] of byGame) {
		const cards = stackFor(questions)
		if (cards) games.push({ id, league: cards[0].league, cards })
	}
	return games.sort(
		(a, b) => Date.parse(a.cards[0].locksAt) - Date.parse(b.cards[0].locksAt),
	)
}

// The leagues the hero's chip row offers, the one with the soonest game first.
// Only leagues holding a game the visitor could actually call are listed, so
// tapping a chip never lands on an empty stack.
export function guestPickLeagues<T extends GuestPickCandidate>(
	candidates: T[],
	now: number,
): GuestPickLeague[] {
	const byId = new Map<string, GuestPickLeague>()
	for (const game of allGames(candidates, now)) {
		if (!byId.has(game.league.id)) byId.set(game.league.id, game.league)
	}
	return [...byId.values()]
}

// Leagues take turns, soonest first within each.
function interleaveByLeague<G extends { league: GuestPickLeague }>(
	items: G[],
): G[] {
	const byLeague = new Map<string, G[]>()
	for (const item of items) {
		const queue = byLeague.get(item.league.id)
		if (queue) queue.push(item)
		else byLeague.set(item.league.id, [item])
	}

	const queues = [...byLeague.values()]
	const interleaved: G[] = []
	for (let round = 0; interleaved.length < items.length; round++) {
		for (const queue of queues) {
			const item = queue[round]
			if (item) interleaved.push(item)
		}
	}
	return interleaved
}

// Orders the landing page's games for the hero stack. The first is the game the
// visitor walks through; the rest back the Skip button on its winner card.
//
// leagueId is the league the chip row has selected. Its games come first and
// are exhausted before any other league's, so skipping stays inside the slate
// the visitor chose. What's left over takes turns by league. With no league
// selected every league takes turns from the start.
//
// A game with no team totals up yet (a whole league, early in its season) is
// filled out with the winners of the games after it in that same order, so
// the stack is still who-wins calls rather than a single card: the selected
// league's next games first, then another league's once it runs short.
export function guestPickGames<T extends GuestPickCandidate>(
	candidates: T[],
	now: number,
	leagueId?: string | null,
): GuestPickGame<T>[] {
	const games = allGames(candidates, now)
	const ordered = [
		...games.filter((g) => g.league.id === leagueId),
		...interleaveByLeague(games.filter((g) => g.league.id !== leagueId)),
	]
	return ordered.map((game, index) =>
		game.cards.length > 1
			? game
			: {
					...game,
					cards: [
						game.cards[0],
						...ordered
							.slice(index + 1, index + 1 + FILLER_WINNERS)
							.map((g) => g.cards[0]),
					],
				},
	)
}
