// A Rebalance fixes the count on a win-totals ballot and nothing else. A
// league's wins add up to gamesPerSeason × teams / 2 (one per game), so a
// finished ballot over that total can only lower picks, and one under it can
// only raise them, by no more in all than it's off. That keeps it a way to
// make the ballot add up, not a free re-pick of individual teams.

export type RebalanceChange = { questionId: string; guessValue: number }

// The reason a rebalance is refused, or null when it's allowed. `current` is
// every pick on the ballot, keyed by questionId.
export function rebalanceProblem(input: {
	current: Map<string, number>
	changes: RebalanceChange[]
	target: number
	gamesPerSeason: number
}): string | null {
	const { current, changes, target, gamesPerSeason } = input
	const total = [...current.values()].reduce((sum, v) => sum + v, 0)
	const off = total - target
	if (off === 0) {
		return `Your picks already add up to the ${target} wins the schedule hands out.`
	}
	if (changes.length === 0) return "Change at least one pick."

	const ids = new Set<string>()
	let newTotal = total
	for (const change of changes) {
		const before = current.get(change.questionId)
		if (before === undefined) return "That team isn't one of your picks here."
		if (ids.has(change.questionId)) return "A team is listed twice."
		ids.add(change.questionId)
		if (
			!Number.isInteger(change.guessValue) ||
			change.guessValue < 0 ||
			change.guessValue > gamesPerSeason
		) {
			return `A win total has to be a whole number from 0 to ${gamesPerSeason}.`
		}
		if (off > 0 && change.guessValue >= before) {
			return "You're over the schedule's total, so a rebalance can only lower picks."
		}
		if (off < 0 && change.guessValue <= before) {
			return "You're under the schedule's total, so a rebalance can only raise picks."
		}
		newTotal += change.guessValue - before
	}

	if (off > 0 && newTotal < target) {
		return `That takes back more than the ${off} wins you're over.`
	}
	if (off < 0 && newTotal > target) {
		return `That adds more than the ${-off} wins you're under.`
	}
	return null
}
