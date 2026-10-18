import type { QuestionShape } from "./index"

// A chain is a set of calls from different members of a group, one each,
// that all have to hit. Each link scores exactly as it would on its own; the
// chain only adds an award on top. If every link hits, each member's win is
// multiplied by how unlikely everyone else's links were. If any link misses,
// every member whose link hit has that hit taken back, and whoever missed
// keeps their ordinary loss and nothing more.
//
// The multiplier leaves out the member's own link because their own win
// already pays for its own odds, and then pays a little over those odds - see
// CHAIN_HOLD_BOOST. A member whose link hits p of the time, in a chain that
// holds P of the time, has a multiplier of (p/P) x b. Their award is
// rp x ((p/P) x b - 1) when it holds and -rp when they hit but it breaks,
// which happens p - P of the time, so they expect
// P x rp x ((p/P) x b - 1) - (p - P) x rp = (b - 1) x p x rp, where rp is
// their win: a tenth of what their call expects to win, on top of the call's
// own edge.

export const CHAIN_MIN_LINKS = 2
// Seven coin flips hold about 1 in 128 times, and each member's multiplier is
// about 70x, still under the cap below. Past that, a chain holds too rarely for a
// group to ever see it happen.
export const CHAIN_MAX_LINKS = 7
// How far over its odds a held chain pays. At exactly its odds a chain
// would break even on average, and chains only exist inside groups, which are
// worth rewarding a little: over enough of them, chaining should come out
// ahead of calling alone.
export const CHAIN_HOLD_BOOST = 1.1

// A ceiling on any one member's multiplier, so a chain of long shots can't
// reach a number in the thousands. It only binds when long shots are in the
// chain; seven coin flips stay under it.
export const CHAIN_MULT_CAP = 100

// The over/unders a game generates. Their lines are set near even and carry
// no per-option price, so their chance is read off the line itself - see
// chainHitChance.
export const CHAIN_OVER_UNDER_SHAPES = new Set<QuestionShape>([
	"game_total_over_under",
	"team_stat_over_under",
	"player_stat_over_under",
])

// Every shape a link can be on: a single pick in one game, with a chance the
// model can stand behind. A numeric guess has no side to price, and a season
// question has no game to chain on.
export const CHAIN_LINK_SHAPES = new Set<QuestionShape>([
	...CHAIN_OVER_UNDER_SHAPES,
	"team_vs_team",
	"player_vs_player",
	"player_game_stat_leader",
])

// The chance a link hits, or null when there's nothing to read it from. A
// priced side carries the model's chance on the selection itself. A generated
// over/under carries the chance of the over on its line where a game score
// model set it, and is set to even otherwise, which is also how it scores.
export function chainHitChance(input: {
	modelHitRate: number | null
	overUnder: { side: "over" | "under"; pOver: number | null } | null
}): number | null {
	if (input.modelHitRate != null) {
		return input.modelHitRate > 0 && input.modelHitRate < 1
			? input.modelHitRate
			: null
	}
	if (!input.overUnder) return null
	const pOver = input.overUnder.pOver ?? 0.5
	const chance = input.overUnder.side === "over" ? pOver : 1 - pOver
	return chance > 0 && chance < 1 ? chance : null
}

// One member's multiplier: how unlikely every other link in the chain was,
// boosted, then capped. A lone link has nothing to multiply by.
export function chainMultiplier(otherChances: number[]): number {
	if (otherChances.length === 0) return 1
	const odds = otherChances.reduce((product, chance) => product / chance, 1)
	return Math.min(CHAIN_MULT_CAP, odds * CHAIN_HOLD_BOOST)
}

// Where a link stands. "void" is a link that no longer counts at all: its
// question was voided or its call went unscored. It drops out of the chain
// rather than breaking it.
export type ChainLinkOutcome = "hit" | "miss" | "pending" | "void"

export type ChainLinkFacts = {
	linkId: string
	userId: string
	questionId: string
	hitChance: number
	outcome: ChainLinkOutcome
	// The link's own scored points. Read only on a hit.
	resultPoints: number | null
	// When the result became real: the game going final, or its kickoff for a
	// game that went final before that was recorded.
	realizedAt: Date | null
	startsAt: Date
}

export type ChainState = "pending" | "held" | "broken" | "void"

export type ChainAward = { linkId: string; userId: string; points: number }

export type ChainResult = {
	state: ChainState
	breakerLinkId: string | null
	// Every counted link's multiplier, keyed by link. Empty on a void chain.
	multipliers: Map<string, number>
	awards: ChainAward[]
}

// The order misses are blamed in: whichever went final first broke the
// chain, even if a later game would have broken it anyway. Ties fall back the
// same way a streak's order does.
function compareMisses(a: ChainLinkFacts, b: ChainLinkFacts): number {
	const aAt = (a.realizedAt ?? a.startsAt).getTime()
	const bAt = (b.realizedAt ?? b.startsAt).getTime()
	return (
		aAt - bAt ||
		a.startsAt.getTime() - b.startsAt.getTime() ||
		a.questionId.localeCompare(b.questionId) ||
		a.linkId.localeCompare(b.linkId)
	)
}

// The chain's state and what it awards each member, from where its links
// stand. A broken chain takes back every hit it can see, including hits that
// land after the miss; one still waiting on a link awards nothing yet.
export function computeChain(links: ChainLinkFacts[]): ChainResult {
	const counted = links.filter((link) => link.outcome !== "void")
	if (counted.length < CHAIN_MIN_LINKS) {
		return {
			state: "void",
			breakerLinkId: null,
			multipliers: new Map(),
			awards: [],
		}
	}

	const multipliers = new Map(
		counted.map((link) => [
			link.linkId,
			chainMultiplier(
				counted
					.filter((other) => other.linkId !== link.linkId)
					.map((other) => other.hitChance),
			),
		]),
	)

	const misses = counted
		.filter((link) => link.outcome === "miss")
		.sort(compareMisses)
	const breaker = misses[0]
	if (breaker) {
		return {
			state: "broken",
			breakerLinkId: breaker.linkId,
			multipliers,
			awards: counted.flatMap((link) =>
				link.outcome === "hit" && link.resultPoints
					? [
							{
								linkId: link.linkId,
								userId: link.userId,
								points: -link.resultPoints,
							},
						]
					: [],
			),
		}
	}

	if (counted.some((link) => link.outcome !== "hit")) {
		return { state: "pending", breakerLinkId: null, multipliers, awards: [] }
	}

	return {
		state: "held",
		breakerLinkId: null,
		multipliers,
		awards: counted.flatMap((link) => {
			const mult = multipliers.get(link.linkId) ?? 1
			const points = Math.round((link.resultPoints ?? 0) * (mult - 1))
			return points
				? [{ linkId: link.linkId, userId: link.userId, points }]
				: []
		}),
	}
}

// A multiplier as it's shown: one decimal under 10x, whole numbers from
// there, and never a trailing ".0" - "2x", "4.2x", "16x".
export function formatChainMultiplier(mult: number): string {
	const shown = mult >= 10 ? Math.round(mult) : Math.round(mult * 10) / 10
	return `${shown}x`
}
