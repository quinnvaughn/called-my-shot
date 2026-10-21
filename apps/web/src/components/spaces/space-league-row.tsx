import { Link } from "@tanstack/react-router"
import { FiChevronRight } from "react-icons/fi"
import { css } from "styled-system/css"
import { Tag } from "#/components/ui/tag"
import type { SeasonPhase } from "#/graphql/generated/graphql"

type Props = {
	league: {
		name: string
		abbreviation: string
		slug: string
		currentSeason?: { displayName: string; phase: SeasonPhase } | null
	}
}

export function SpaceLeagueRow({ league }: Props) {
	return (
		<Link
			to="/leagues/$leagueSlug"
			params={{ leagueSlug: league.slug }}
			className={css({
				display: "flex",
				alignItems: "center",
				gap: "3",
				padding: "{spacing.3} {spacing.4}",
				color: "fg.default",
				_hover: { bg: "bg.subtle" },
				"&:not(:last-child)": {
					borderBottom: "1px solid {colors.border.default}",
				},
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
			<FiChevronRight size={16} className={css({ color: "fg.subtle" })} />
		</Link>
	)
}
