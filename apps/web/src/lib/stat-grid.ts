import { MIN_EDGE_SAMPLE } from "@called-my-shot/scoring"
import { formatSigned } from "#/lib/format-number"

export type StatGridItem = {
	label: string
	value: string
	// What the stat measures, shown from the info icon beside the label.
	description: string
	// Shown in place of the value, for a stat that isn't showing a number yet
	// and owes the reader a reason why. Kept on the value's row so a locked
	// tile is no taller than its neighbors.
	hint?: string
}

type Stats = {
	// null until a resolved call
	rank: number | null
	totalPoints: number
	accuracy: number | null
	// null until the record clears MIN_EDGE_SAMPLE with both a hit and a miss
	convictionEdge: number | null
	resolvedCallCount: number
}

// Why the edge tile is locked, in the reader's terms. Derived from the
// resolved count already on the same object rather than a second API field,
// since those are the only two ways convictionEdge comes back null.
function convictionEdgeHint(stats: Stats): string {
	const remaining = MIN_EDGE_SAMPLE - stats.resolvedCallCount
	return remaining > 0
		? `${remaining} more to unlock`
		: "needs a hit and a miss"
}

export function statGridItems(stats: Stats): StatGridItem[] {
	return [
		{
			label: "Points",
			value: stats.totalPoints.toLocaleString(),
			description:
				"Net points from resolved picks. Hits add points and misses take them away. Conviction sets how much of each pick is in play.",
		},
		{
			label: "Rank",
			value: stats.rank !== null ? `#${stats.rank}` : "N/A",
			description:
				"Place on the leaderboard, ordered by points. Ties go to the higher accuracy. Unranked until a pick resolves.",
		},
		{
			label: "Accuracy",
			value: stats.accuracy !== null ? `${Math.round(stats.accuracy)}%` : "-",
			description: "Share of resolved picks that hit.",
		},
		// Sits next to accuracy because it's the other half of the same
		// question: accuracy is how often you're right, this is whether you
		// knew which ones those would be.
		{
			label: "Conviction Edge",
			// Signed on purpose. A leading + is the whole point of the stat: 18
			// alone reads like a count, +18 reads like a direction.
			value:
				stats.convictionEdge !== null
					? formatSigned(stats.convictionEdge, { round: "whole" })
					: "-",
			description: `Average conviction on hits minus average conviction on misses. Positive means high-conviction picks tend to hit and low-conviction picks tend to miss. Unlocks at ${MIN_EDGE_SAMPLE} resolved picks with at least one hit and one miss.`,
			...(stats.convictionEdge === null
				? { hint: convictionEdgeHint(stats) }
				: {}),
		},
		{
			label: "Resolved",
			value: stats.resolvedCallCount.toLocaleString(),
			description:
				"Picks that have been graded. A call with several picks counts each one.",
		},
	]
}
