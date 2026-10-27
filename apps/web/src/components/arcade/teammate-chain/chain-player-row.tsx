import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { PlayerHeadshot } from "#/components/ui/player-headshot"
import type { TeammateChainPlayer_PlayerFragment } from "#/graphql/generated/graphql"
import { ChainPlayerTeam } from "./chain-player-team"
import { chainPlayerYears } from "./chain-result"

// One player in a chain: photo, name and every team he played for in the
// league with the years there, the start and the target marked as the
// chain's two ends. The teams are always shown: knowing where someone
// played is where the game starts, and naming who he played with there is
// the game. `trailing` sits at the right, for what a row adds (a rarity
// share).
export function ChainPlayerRow({
	player,
	end,
	trailing,
}: {
	player: TeammateChainPlayer_PlayerFragment
	end?: "start" | "target"
	trailing?: ReactNode
}) {
	const years = chainPlayerYears(player)
	return (
		<div
			className={css({
				display: "flex",
				alignItems: "center",
				gap: "3",
				padding: "{spacing.2} {spacing.3}",
				borderRadius: "lg",
				bg: end ? "bg.subtle" : "transparent",
			})}
		>
			<PlayerHeadshot
				name={player.player.name}
				src={player.player.headshotUrl}
				size={end ? "lg" : "md"}
			/>
			<div className={css({ flex: 1, minWidth: 0 })}>
				{end && (
					<span
						className={css({
							display: "block",
							textStyle: "labelSm",
							color: "fg.muted",
						})}
					>
						{end === "start" ? "Start" : "Connect to"}
					</span>
				)}
				<span
					className={css({
						display: "block",
						fontWeight: "semibold",
						fontSize: end ? "md" : "sm",
						truncate: true,
					})}
				>
					{player.player.name}
				</span>
				{player.teams.length > 0 ? (
					<ul
						className={css({
							display: "flex",
							flexWrap: "wrap",
							columnGap: "3",
							rowGap: "1",
							marginTop: "1",
						})}
					>
						{player.teams.map((entry) => (
							<ChainPlayerTeam
								key={`${entry.team.id}:${entry.name}`}
								entry={entry}
							/>
						))}
					</ul>
				) : (
					years && (
						<span className={css({ textStyle: "labelSm", color: "fg.muted" })}>
							{years}
						</span>
					)
				)}
			</div>
			{trailing}
		</div>
	)
}
