import { css } from "styled-system/css"
import { Grid, VStack } from "styled-system/jsx"
import { Card } from "#/components/ui/card"

export type StatGridItem = {
	label: string
	value: string
}

type Stats = {
	rank: number
	totalPoints: number
	accuracy: number | null
	callCount: number
}

export function statGridItems(stats: Stats): StatGridItem[] {
	return [
		{ label: "Points", value: stats.totalPoints.toLocaleString() },
		{ label: "Rank", value: `#${stats.rank}` },
		{
			label: "Accuracy",
			value: stats.accuracy !== null ? `${Math.round(stats.accuracy)}%` : "-",
		},
		{ label: "Calls made", value: stats.callCount.toLocaleString() },
	]
}

export function StatGrid({ items }: { items: StatGridItem[] }) {
	return (
		<Grid
			gridTemplateColumns={{ base: "1fr 1fr", sm: "repeat(4, 1fr)" }}
			gap="2.5"
		>
			{items.map((item) => (
				<Card key={item.label} size="sm" variant="surface">
					<Card.Body>
						<VStack gap="0.5" alignItems="flex-start">
							<span className={css({ fontFamily: "heading", fontSize: "lg" })}>
								{item.value}
							</span>
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
			))}
		</Grid>
	)
}
