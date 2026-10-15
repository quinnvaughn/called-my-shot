import { css, cx } from "styled-system/css"
import { Grid, HStack } from "styled-system/jsx"
import { PlayerOrTeamImage } from "#/components/ui/player-or-team-image"
import { convictionSummary, pickSummary } from "#/lib/call-summary"
import { PointsCell } from "./points-cell"
import { ellipsis, mono } from "./styles"
import type { Call, Entry } from "./types"

// One side's call on one line: whose, the pick with its logo or headshot,
// how sure, and what it counts for.
export function CallLine({
	who,
	entry,
	call,
	scored,
	empty,
	isViewer,
}: {
	who: string
	entry: Entry
	call: Call | null
	scored: number | null | undefined
	empty: string
	// The viewer's own line, picked out the way "this is you" is everywhere
	// else: blue, never the orange that means something can be tapped.
	isViewer: boolean
}) {
	const first = call?.selections[0]?.option
	return (
		<Grid
			gridTemplateColumns="subgrid"
			gridColumn="1 / -1"
			alignItems="center"
			className={
				isViewer
					? css({
							marginInline: "-2",
							paddingInline: "2",
							paddingBlock: "1.5",
							borderRadius: "md",
							backgroundColor: "secondary.subtle",
						})
					: css({ paddingBlock: "1.5" })
			}
		>
			<span
				className={cx(
					mono,
					ellipsis,
					isViewer && css({ color: "secondary.default", fontWeight: "bold" }),
				)}
			>
				{who}
			</span>
			{call ? (
				<HStack gap="2" minWidth="0">
					{first && (
						<PlayerOrTeamImage player={first.player} team={first.team} />
					)}
					<span className={cx(css({ fontWeight: "semibold" }), ellipsis)}>
						{pickSummary(call)}
					</span>
					<span className={mono}>{convictionSummary(call)}</span>
				</HStack>
			) : (
				<span className={mono}>{empty}</span>
			)}
			<PointsCell entry={entry} call={call} scored={scored} />
		</Grid>
	)
}
