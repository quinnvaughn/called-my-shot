import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { TeamBadge } from "#/components/ui/team-badge"

type Team = {
	id: string
	abbreviation: string
	color: string
	logoUrl?: string | null
}

export type SeriesBlockData = {
	roundLabel: string
	summary: string | null
	seeds: { teamId: string; seed: number }[]
	gameOne: { awayTeam: Team; homeTeam: Team } | null
}

const seedClass = css({
	fontFamily: "mono",
	fontSize: "2xs",
	color: "fg.muted",
})

function SeededBadge({ team, seed }: { team: Team; seed?: number }) {
	return (
		<HStack gap="1" alignItems="center">
			{seed !== undefined && <span className={seedClass}>({seed})</span>}
			<TeamBadge
				abbreviation={team.abbreviation}
				color={team.color}
				logoUrl={team.logoUrl}
				showAbbreviation
			/>
		</HStack>
	)
}

// GameBlock's counterpart for a series question: the two teams, the round,
// and where the series stands. It's what lets a series question's title stay
// "Who wins the series?" wherever the question shows up.
export function SeriesBlock({ series }: { series: SeriesBlockData }) {
	const teams = series.gameOne
	const seedOf = (teamId: string) =>
		series.seeds.find((s) => s.teamId === teamId)?.seed
	return (
		<HStack
			justify="space-between"
			alignItems="center"
			flexWrap="wrap"
			gap="2"
			className={css({
				border: "1px solid {colors.border.default}",
				borderRadius: "lg",
				bg: "bg.subtle",
				paddingInline: "3",
				paddingBlock: "2.5",
			})}
		>
			{teams && (
				<HStack gap="2" alignItems="center">
					<SeededBadge team={teams.awayTeam} seed={seedOf(teams.awayTeam.id)} />
					<span
						className={css({
							fontFamily: "mono",
							fontSize: "2xs",
							color: "fg.subtle",
						})}
					>
						vs
					</span>
					<SeededBadge team={teams.homeTeam} seed={seedOf(teams.homeTeam.id)} />
				</HStack>
			)}
			<span
				className={css({
					fontFamily: "mono",
					fontSize: "2xs",
					color: "secondary.default",
					whiteSpace: "nowrap",
				})}
			>
				{series.summary
					? `${series.roundLabel} · ${series.summary}`
					: series.roundLabel}
			</span>
		</HStack>
	)
}
