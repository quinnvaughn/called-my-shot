import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { FollowButton } from "#/components/follows/follow-button"
import { Tag } from "#/components/ui/tag"
import type { SeasonPhase } from "#/graphql/generated/graphql"

type Props = {
	league: {
		id: string
		name: string
		abbreviation: string
		slug: string
		currentSeason?: { displayName: string; phase: SeasonPhase } | null
	}
	following: boolean
}

// The row opens the league; the button beside it follows the league, which
// is what puts it on the space rail and in Home's feed.
export function SpaceLeagueRow({ league, following }: Props) {
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
				to="/leagues/$leagueSlug"
				params={{ leagueSlug: league.slug }}
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
				<span
					className={css({
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						width: "9",
						height: "9",
						flexShrink: 0,
						borderRadius: "md",
						bg: "bg.subtle",
						border: "1px solid {colors.border.default}",
						textStyle: "metaSm",
						fontWeight: "bold",
					})}
				>
					{league.abbreviation}
				</span>
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
						{league.name}
					</span>
					{league.currentSeason && (
						<span className={css({ textStyle: "label", color: "fg.muted" })}>
							{league.currentSeason.displayName}
						</span>
					)}
				</span>
				{league.currentSeason?.phase === "POSTSEASON" && (
					<Tag size="sm">Playoffs</Tag>
				)}
			</Link>
			<FollowButton
				kind="LEAGUE"
				id={league.id}
				following={following}
				name={league.name}
			/>
		</div>
	)
}
