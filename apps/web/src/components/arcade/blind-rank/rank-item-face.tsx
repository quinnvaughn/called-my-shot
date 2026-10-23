import { css } from "styled-system/css"
import { TeamBadge } from "#/components/ui/team-badge"

export type RankItemView = {
	label: string
	sublabel?: string | null
	team?: {
		abbreviation: string
		color: string
		logoUrl?: string | null
	} | null
}

// One thing to rank: its logo, its name, and who or what it was.
export function RankItemFace({
	item,
	size = "sm",
}: {
	item: RankItemView
	size?: "sm" | "lg"
}) {
	return (
		<span
			className={css({
				display: "flex",
				alignItems: "center",
				gap: size === "lg" ? "4" : "2.5",
				minWidth: 0,
			})}
		>
			{item.team && (
				<span
					className={css({
						display: "flex",
						flexShrink: 0,
						padding: size === "lg" ? "2" : "0",
						borderRadius: "xl",
						bg: size === "lg" ? "white" : "transparent",
					})}
				>
					<TeamBadge
						abbreviation={item.team.abbreviation}
						color={item.team.color}
						logoUrl={item.team.logoUrl}
						size={size === "lg" ? "lg" : undefined}
					/>
				</span>
			)}
			<span
				className={css({
					display: "flex",
					flexDirection: "column",
					minWidth: 0,
				})}
			>
				<span
					className={css({
						fontFamily: size === "lg" ? "heading" : "body",
						fontSize: size === "lg" ? { base: "2xl", md: "3xl" } : "sm",
						fontWeight: size === "lg" ? "normal" : "semibold",
						lineHeight: "1.1",
						overflowWrap: "anywhere",
					})}
				>
					{item.label}
				</span>
				{item.sublabel && (
					<span
						className={css({
							fontSize: size === "lg" ? "md" : "xs",
							opacity: 0.8,
							truncate: true,
						})}
					>
						{item.sublabel}
					</span>
				)}
			</span>
		</span>
	)
}
