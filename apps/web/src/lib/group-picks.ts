// "Sam and 2 others picked Over, 1 picked Under" on a game-page card: which
// way the people in the viewer's groups went, naming the most recent of them
// on the side most of them took. Built from Question.viewerGroupPicks.

type Tally<U extends { name: string }> = {
	optionId: string
	count: number
	sampleUser: U
}

type Option = { id: string; label: string; sortOrder: number }

export type GroupPicksLine<U extends { name: string }> = {
	text: string
	// Whose avatar goes beside the line.
	sampleUser: U
}

const others = (count: number) =>
	count === 1 ? " and 1 other" : count > 1 ? ` and ${count} others` : ""

// Null when no group-mate has picked anything. A two-sided question names
// both sides once anyone is on each; a pool names only the option most of
// them took, since a list of five names is a leaderboard, not a line.
export function groupPicksLine<U extends { name: string }>(
	tallies: Tally<U>[],
	options: Option[],
): GroupPicksLine<U> | null {
	const optionById = new Map(options.map((option) => [option.id, option]))
	const ranked = tallies
		.filter((tally) => tally.count > 0 && optionById.has(tally.optionId))
		.sort(
			(x, y) =>
				y.count - x.count ||
				(optionById.get(x.optionId)?.sortOrder ?? 0) -
					(optionById.get(y.optionId)?.sortOrder ?? 0),
		)
	const [lead, second] = ranked
	if (!lead) return null
	const labelOf = (tally: Tally<U>) =>
		optionById.get(tally.optionId)?.label ?? ""

	const head = `${lead.sampleUser.name}${others(lead.count - 1)} picked ${labelOf(lead)}`
	const tail =
		options.length === 2 && second
			? `, ${second.count} picked ${labelOf(second)}`
			: ""
	return { text: `${head}${tail}`, sampleUser: lead.sampleUser }
}
