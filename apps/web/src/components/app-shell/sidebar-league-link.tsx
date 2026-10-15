import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { Tag } from "#/components/ui/tag"
import { sidebarRow, sidebarRowActive } from "./sidebar-row"
import type { League } from "./types"

export function SidebarLeagueLink({
	league,
	onNavigate,
}: {
	league: League
	onNavigate: () => void
}) {
	return (
		<Link
			to="/leagues/$leagueSlug"
			params={{ leagueSlug: league.slug }}
			onClick={onNavigate}
			activeProps={{ className: sidebarRowActive }}
			className={sidebarRow}
		>
			<span
				className={css({
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					width: "6",
					height: "6",
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
			{league.name}
			{league.currentSeason?.phase === "POSTSEASON" && (
				<span className={css({ marginInlineStart: "auto" })}>
					<Tag size="sm">Playoffs</Tag>
				</span>
			)}
		</Link>
	)
}
