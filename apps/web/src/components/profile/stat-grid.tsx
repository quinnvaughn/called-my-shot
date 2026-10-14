import { MIN_EDGE_SAMPLE } from "@called-my-shot/scoring"
import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { Grid, HStack, VStack } from "styled-system/jsx"
import { Card } from "#/components/ui/card"
import { CardRail } from "#/components/ui/card-rail"
import { InfoTip } from "#/components/ui/info-tip"

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

// Signed on purpose. A leading + is the whole point of the stat: 18 alone
// reads like a count, +18 reads like a direction.
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

type Props = {
	items: StatGridItem[]
	// The section's heading, if it has one. On a phone it heads the rail,
	// beside the prev/next buttons; from sm up it sits above the grid.
	header?: ReactNode
}

// A sideways rail on a phone, where two columns of tiles run three rows
// tall; a single row of five from sm up.
export function StatGrid({ items, header }: Props) {
	return (
		<>
			<div className={css({ display: { base: "block", sm: "none" } })}>
				<CardRail
					items={items}
					getKey={(item) => item.label}
					renderItem={(item) => <StatTile item={item} />}
					header={header}
					itemLabel="stat"
					itemBasis="45%"
				/>
			</div>
			<VStack
				display={{ base: "none", sm: "flex" }}
				alignItems="stretch"
				gap="3"
			>
				{header}
				<Grid gridTemplateColumns="repeat(5, 1fr)" gap="2.5">
					{items.map((item) => (
						<StatTile key={item.label} item={item} />
					))}
				</Grid>
			</VStack>
		</>
	)
}

function StatTile({ item }: { item: StatGridItem }) {
	return (
		<Card size="sm" variant="surface">
			<Card.Body>
				<VStack gap="0.5" alignItems="stretch">
					{/* The tip rides the value's row, so a label that wraps
					    in a narrow tile doesn't drag the icon down with it. */}
					<HStack justify="space-between" alignItems="center" gap="2">
						{item.hint ? (
							<span
								className={css({
									fontFamily: "mono",
									fontSize: "xs",
									letterSpacing: "wide",
									color: "fg.subtle",
								})}
							>
								{item.hint}
							</span>
						) : (
							<span
								className={css({ fontFamily: "heading", fontSize: "lg" })}
							>
								{item.value}
							</span>
						)}
						<InfoTip label={item.label} text={item.description} />
					</HStack>
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
				</VStack>
			</Card.Body>
		</Card>
	)
}
