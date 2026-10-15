import { Grid, VStack } from "styled-system/jsx"
import type { Tile } from "#/lib/stat-context"
import { denseTileValueClass, tileLabelClass, tileValueClass } from "./styles"

// Shared by both column renderers so a matchup's tiles and a stat line's can't
// drift into two different grids.
export function TileGrid({ tiles, dense }: { tiles: Tile[]; dense: boolean }) {
	if (tiles.length === 0) return null

	return (
		<Grid
			gridTemplateColumns={{
				base: "repeat(2, minmax(0, 1fr))",
				sm: "repeat(auto-fit, minmax(7rem, 1fr))",
			}}
			gap={dense ? "2" : "2.5"}
		>
			{tiles.map((tile) => (
				<VStack key={tile.label} gap="0.5" alignItems="flex-start">
					<span className={dense ? denseTileValueClass : tileValueClass}>
						{tile.value}
					</span>
					<span className={tileLabelClass}>{tile.label}</span>
				</VStack>
			))}
		</Grid>
	)
}
