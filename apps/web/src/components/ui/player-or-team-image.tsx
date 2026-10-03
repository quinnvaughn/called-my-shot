import { PlayerHeadshot } from "./player-headshot"
import { TeamBadge } from "./team-badge"

export type ImagePlayer = { name: string; headshotUrl?: string | null }
export type ImageTeam = {
	abbreviation: string
	color: string
	logoUrl?: string | null
}

type Props = {
	player?: ImagePlayer | null
	team?: ImageTeam | null
	// "lg" beside a pick shown as a headline.
	size?: "sm" | "lg"
}

// For a row that can name either a player or a team (a question option, a
// stat subject): the player's headshot, else the team's logo, else nothing for
// a row that is neither (Over, Yes, a freeform label).
export function PlayerOrTeamImage({ player, team, size = "sm" }: Props) {
	if (player)
		return (
			<PlayerHeadshot name={player.name} src={player.headshotUrl} size={size} />
		)
	if (team) {
		return (
			<TeamBadge
				abbreviation={team.abbreviation}
				color={team.color}
				logoUrl={team.logoUrl}
				size={size}
			/>
		)
	}
	return null
}
