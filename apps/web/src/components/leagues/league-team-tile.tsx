import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { FollowButton } from "#/components/follows/follow-button"
import { TeamBadge } from "#/components/ui/team-badge"
import { teamSlug } from "#/lib/team-slug"

type Props = {
	leagueSlug: string
	team: {
		id: string
		name: string
		abbreviation: string
		color: string
		logoUrl?: string | null
		viewerFollows: boolean
	}
}

// One franchise on a league's Teams tab: its logo and name open the team's
// space, and the button beside them follows it.
export function LeagueTeamTile({ leagueSlug, team }: Props) {
	return (
		<div
			className={css({
				display: "flex",
				alignItems: "center",
				gap: "3",
				padding: "3",
				bg: "bg.surface",
				border: "1px solid {colors.border.default}",
				borderRadius: "xl",
			})}
		>
			<Link
				to="/leagues/$leagueSlug/teams/$teamSlug"
				params={{ leagueSlug, teamSlug: teamSlug(team.abbreviation) }}
				className={css({
					display: "flex",
					alignItems: "center",
					gap: "3",
					flex: 1,
					minWidth: 0,
					color: "fg.default",
					_hover: { textDecoration: "underline" },
				})}
			>
				<TeamBadge
					abbreviation={team.abbreviation}
					color={team.color}
					logoUrl={team.logoUrl}
				/>
				<span
					className={css({
						fontSize: "sm",
						fontWeight: "medium",
						truncate: true,
					})}
				>
					{team.name}
				</span>
			</Link>
			<FollowButton
				kind="TEAM"
				id={team.id}
				following={team.viewerFollows}
				name={team.name}
			/>
		</div>
	)
}
