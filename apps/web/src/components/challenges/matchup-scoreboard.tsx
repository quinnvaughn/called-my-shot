import { Grid } from "styled-system/jsx"
import type { MatchupOutcome } from "#/graphql/generated/graphql"
import { type Result, type Side, SideTile } from "./side-tile"

// Both sides of one 1v1, side by side, with the winner picked out once it's
// settled. `leading` goes on the left: the viewer's side when they're in it.
export function MatchupScoreboard({
	creator,
	acceptor,
	outcome,
	leading,
}: {
	creator: Side
	acceptor: Side
	outcome: MatchupOutcome | null
	leading: "creator" | "acceptor"
}) {
	const resultFor = (side: MatchupOutcome): Result =>
		outcome === null
			? null
			: outcome === "DRAW"
				? "draw"
				: outcome === side
					? "won"
					: "lost"
	const creatorTile = (
		<SideTile
			key="creator"
			label={creator.label}
			points={creator.points}
			open={creator.open}
			result={resultFor("CREATOR")}
		/>
	)
	const acceptorTile = (
		<SideTile
			key="acceptor"
			label={acceptor.label}
			points={acceptor.points}
			open={acceptor.open}
			result={resultFor("ACCEPTOR")}
		/>
	)
	return (
		<Grid columns={2} gap="3">
			{leading === "creator"
				? [creatorTile, acceptorTile]
				: [acceptorTile, creatorTile]}
		</Grid>
	)
}
