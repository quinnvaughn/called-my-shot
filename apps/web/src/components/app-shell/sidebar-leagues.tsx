import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { Tag } from "#/components/ui/tag"
import type { League } from "./types"

export function SidebarLeagues({
	leagues,
	onNavigate,
}: {
	leagues: League[]
	onNavigate: () => void
}) {
	if (leagues.length === 0) return null

	return (
		<VStack alignItems="stretch" gap="1.5">
			<span
				className={css({
					fontFamily: "mono",
					fontSize: "2xs",
					letterSpacing: "wide",
					color: "fg.subtle",
					paddingInline: "3",
				})}
			>
				LEAGUES
			</span>
			{leagues.map((league) => (
				<Link
					key={league.id}
					to="/leagues/$leagueSlug"
					params={{ leagueSlug: league.slug }}
					onClick={onNavigate}
					activeProps={{
						className: css({
							bg: "bg.subtle",
							color: "fg.default",
						}),
					}}
					className={css({
						display: "flex",
						alignItems: "center",
						gap: "2.5",
						padding: "{spacing.2} {spacing.3}",
						borderRadius: "lg",
						fontSize: "sm",
						fontWeight: "medium",
						color: "fg.subtle",
						_hover: { bg: "fg.default/10", color: "fg.default" },
					})}
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
							fontFamily: "mono",
							fontSize: "3xs",
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
			))}
		</VStack>
	)
}
