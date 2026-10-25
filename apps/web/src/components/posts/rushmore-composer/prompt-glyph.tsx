import { FiGlobe } from "react-icons/fi"
import { css } from "styled-system/css"
import { TeamBadge } from "#/components/ui/team-badge"

type Props = {
	league: { abbreviation: string } | null
	team: { abbreviation: string; color: string; logoUrl: string | null } | null
}

const box = css({
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	width: "8",
	height: "8",
	flexShrink: 0,
	borderRadius: "md",
	bg: "bg.subtle",
	border: "1px solid {colors.border.default}",
	fontFamily: "mono",
	fontSize: "2xs",
	fontWeight: "bold",
	color: "fg.muted",
})

// What a prompt is of, at a glance: the team's logo, the league's
// abbreviation, or a globe for a prompt open to every sport.
export function PromptGlyph({ league, team }: Props) {
	if (team) {
		return (
			<span className={css({ display: "flex", width: "8", flexShrink: 0 })}>
				<TeamBadge
					abbreviation={team.abbreviation}
					color={team.color}
					logoUrl={team.logoUrl}
				/>
			</span>
		)
	}
	return (
		<span className={box}>
			{league ? league.abbreviation : <FiGlobe size={14} aria-hidden />}
		</span>
	)
}
