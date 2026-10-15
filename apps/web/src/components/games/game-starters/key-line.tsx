import { HStack } from "styled-system/jsx"
import { PlayerHeadshot } from "#/components/ui/player-headshot"
import { Tag } from "#/components/ui/tag"
import { TeamBadge } from "#/components/ui/team-badge"
import { keyStarters } from "#/lib/game-starters"
import { detailClass, emptyClass, nameClass } from "./styles"
import type { Starter, Team } from "./types"

export function KeyLine({
	team,
	starters,
}: {
	team: Team
	starters: Starter[]
}) {
	const key = keyStarters(starters)

	return (
		<HStack gap="2.5" alignItems="center" minWidth="0">
			<TeamBadge
				abbreviation={team.abbreviation}
				color={team.color}
				logoUrl={team.logoUrl}
				showAbbreviation
			/>
			{key.length === 0 ? (
				<span className={emptyClass}>Not announced yet</span>
			) : (
				<HStack gap="1.5" alignItems="center" flexWrap="wrap" minWidth="0">
					{key.map((starter, index) => (
						<HStack key={starter.id} gap="1.5" alignItems="center" minWidth="0">
							<PlayerHeadshot
								name={starter.playerName}
								src={starter.player?.headshotUrl}
							/>
							<span className={nameClass}>
								{starter.playerName}
								{index < key.length - 1 ? "," : ""}
							</span>
							{starter.statLine && (
								<span className={detailClass}>{starter.statLine}</span>
							)}
							{starter.injuryStatus && (
								<Tag size="sm">{starter.injuryStatus}</Tag>
							)}
						</HStack>
					))}
				</HStack>
			)}
		</HStack>
	)
}
