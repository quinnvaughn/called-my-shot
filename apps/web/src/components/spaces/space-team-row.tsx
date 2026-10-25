import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { FollowButton } from "#/components/follows/follow-button"
import { TeamBadge } from "#/components/ui/team-badge"
import { teamSlug } from "#/lib/team-slug"

type Props = {
	team: {
		id: string
		name: string
		abbreviation: string
		color: string
		logoUrl?: string | null
		league: { slug: string; abbreviation: string }
	}
}

// A followed team on the Spaces page. The row opens the team's space; the
// button unfollows it, which takes it off the space rail.
export function SpaceTeamRow({ team }: Props) {
	return (
		<div
			className={css({
				display: "flex",
				alignItems: "center",
				gap: "3",
				paddingInlineEnd: "4",
				_hover: { bg: "bg.subtle" },
				"&:not(:last-child)": {
					borderBottom: "1px solid {colors.border.default}",
				},
			})}
		>
			<Link
				to="/leagues/$leagueSlug/teams/$teamSlug"
				params={{
					leagueSlug: team.league.slug,
					teamSlug: teamSlug(team.abbreviation),
				}}
				className={css({
					display: "flex",
					alignItems: "center",
					gap: "3",
					flex: 1,
					minWidth: 0,
					paddingBlock: "3",
					paddingInlineStart: "4",
					color: "fg.default",
				})}
			>
				<TeamBadge
					abbreviation={team.abbreviation}
					color={team.color}
					logoUrl={team.logoUrl}
				/>
				<span
					className={css({
						display: "flex",
						flexDirection: "column",
						gap: "0.5",
						flex: 1,
						minWidth: 0,
					})}
				>
					<span
						className={css({
							fontSize: "sm",
							fontWeight: "medium",
							truncate: true,
						})}
					>
						{team.name}
					</span>
					<span className={css({ textStyle: "label", color: "fg.muted" })}>
						{team.league.abbreviation}
					</span>
				</span>
			</Link>
			<FollowButton kind="TEAM" id={team.id} following name={team.name} />
		</div>
	)
}
