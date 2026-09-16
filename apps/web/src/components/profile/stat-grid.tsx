import { MIN_EDGE_SAMPLE } from "@called-my-shot/scoring"
import { css } from "styled-system/css"
import { Grid, HStack, VStack } from "styled-system/jsx"
import { Card } from "#/components/ui/card"
import { InfoTip } from "#/components/ui/info-tip"

export type StatGridItem = {
	label: string
	value: string
	// What the stat measures, shown from the info icon beside the label.
	description: string
	// A second line under the label, for a stat that isn't showing a number
	// yet and owes the reader a reason why.
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

// Signed on purpose, and shared with the per-shape breakdown so the sign
// convention can't drift between the two places an edge is rendered. A
// leading + is the whole point of the stat: 18 alone reads like a count,
// +18 reads like a direction.
export function formatConvictionEdge(edge: number): string {
	const rounded = Math.round(edge)
	return rounded > 0 ? `+${rounded}` : String(rounded)
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
			value:
				stats.convictionEdge !== null
					? formatConvictionEdge(stats.convictionEdge)
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

export function StatGrid({ items }: { items: StatGridItem[] }) {
	return (
		<Grid
			gridTemplateColumns={{ base: "1fr 1fr", sm: "repeat(5, 1fr)" }}
			gap="2.5"
		>
			{items.map((item) => (
				<Card key={item.label} size="sm" variant="surface">
					<Card.Body>
						<VStack gap="0.5" alignItems="flex-start">
							<span className={css({ fontFamily: "heading", fontSize: "lg" })}>
								{item.value}
							</span>
							<HStack gap="1">
								<span
									className={css({
										fontFamily: "mono",
										fontSize: "3xs",
										letterSpacing: "wide",
										color: "fg.subtle",
										textTransform: "uppercase",
									})}
								>
									{item.label}
								</span>
								<InfoTip label={item.label} text={item.description} />
							</HStack>
							{item.hint && (
								<span
									className={css({
										fontFamily: "mono",
										fontSize: "3xs",
										letterSpacing: "wide",
										color: "fg.subtle",
									})}
								>
									{item.hint}
								</span>
							)}
						</VStack>
					</Card.Body>
				</Card>
			))}
		</Grid>
	)
}
