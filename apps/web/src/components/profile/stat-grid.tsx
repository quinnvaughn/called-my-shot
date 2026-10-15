import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { Grid, VStack } from "styled-system/jsx"
import { CardRail } from "#/components/ui/card-rail"
import type { StatGridItem } from "#/lib/stat-grid"
import { StatGridTile } from "./stat-grid-tile"

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
					renderItem={(item) => <StatGridTile item={item} />}
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
						<StatGridTile key={item.label} item={item} />
					))}
				</Grid>
			</VStack>
		</>
	)
}
