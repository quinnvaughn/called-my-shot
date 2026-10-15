import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { TeamBadge } from "#/components/ui/team-badge"
import { formatRecord } from "#/lib/game-status"

export type TeamRecord = {
	wins: number
	losses: number
	ties: number
	otLosses?: number | null
} | null

export type Team = {
	name: string
	abbreviation: string
	color: string
	logoUrl?: string | null
}

// maxWidth is what actually makes the ellipsis work: the name is a flex item
// in a column stack, so on the cross axis it sizes to fit-content and would
// otherwise overflow its column and collide with the score.
const nameClass = css({
	fontSize: { base: "sm", sm: "md" },
	fontWeight: "bold",
	maxWidth: "100%",
	truncate: true,
})

const denseNameClass = css({
	fontSize: "sm",
	fontWeight: "bold",
	maxWidth: "100%",
	truncate: true,
})

const recordClass = css({
	textStyle: "meta",
	color: "fg.subtle",
})

// Both team lines read left-to-right on mobile; only the home line flips to
// name-then-badge once it sits on the right of a centered score.
const awayLineClass = css({
	gridArea: "away",
	justifyContent: "flex-start",
})

// flex-start at every breakpoint: row-reverse also flips the main axis, so
// from sm up "start" is the right edge and flex-start is what pins the home
// team there. flex-end would pack it left, against the score.
const homeLineClass = css({
	gridArea: "home",
	flexDirection: { base: "row", sm: "row-reverse" },
	justifyContent: "flex-start",
})

export function TeamLine({
	team,
	record,
	seed,
	home,
	dense,
}: {
	team: Team
	record: TeamRecord
	// A playoff game's seed, within the team's own league or conference.
	seed: number | null
	home: boolean
	dense: boolean
}) {
	const formattedRecord = [
		// Null for a game synced before records existed.
		record &&
			formatRecord(
				record.wins,
				record.losses,
				record.otLosses ?? (record.ties || null),
			),
		seed ? `No. ${seed} seed` : null,
	]
		.filter(Boolean)
		.join(" · ")

	return (
		<HStack
			gap={dense ? "2" : "2.5"}
			alignItems="center"
			minWidth="0"
			className={home ? homeLineClass : awayLineClass}
		>
			<TeamBadge
				abbreviation={team.abbreviation}
				color={team.color}
				logoUrl={team.logoUrl}
				size={dense ? "sm" : "lg"}
			/>
			{/* Alignment goes through the VStack prop, not a className: the
			    pattern's own alignItems="center" default otherwise wins. Away
			    reads from the left edge; home from the right once it sits on
			    the right of the score. */}
			<VStack
				gap="0"
				minWidth="0"
				alignItems={
					home ? { base: "flex-start", sm: "flex-end" } : "flex-start"
				}
			>
				<span className={dense ? denseNameClass : nameClass}>{team.name}</span>
				{formattedRecord && (
					<span className={recordClass}>{formattedRecord}</span>
				)}
			</VStack>
		</HStack>
	)
}
