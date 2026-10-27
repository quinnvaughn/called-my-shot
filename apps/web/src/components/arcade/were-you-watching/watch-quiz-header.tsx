import { css } from "styled-system/css"
import { TeamBadge } from "#/components/ui/team-badge"
import { watchGameDay } from "./watch-codes"

type Team = {
	name: string
	abbreviation: string
	color: string
	logoUrl?: string | null
}

// Which game a quiz is on: both teams and the day, in the game's color.
export function WatchQuizHeader({
	team,
	opponent,
	gameStartsAt,
	league,
}: {
	team: Team
	opponent: Team
	gameStartsAt: string
	league: string
}) {
	return (
		<div
			className={css({
				display: "flex",
				alignItems: "center",
				justifyContent: "space-between",
				gap: "3",
				flexWrap: "wrap",
				padding: "{spacing.3} {spacing.4}",
				borderRadius: "xl",
				bg: "watch.default",
				color: "watch.ink",
			})}
		>
			<span
				className={css({ display: "flex", alignItems: "center", gap: "2" })}
			>
				<TeamBadge
					abbreviation={team.abbreviation}
					color={team.color}
					logoUrl={team.logoUrl}
				/>
				<span className={css({ fontFamily: "heading", fontSize: "md" })}>
					{team.abbreviation} vs {opponent.abbreviation}
				</span>
				<TeamBadge
					abbreviation={opponent.abbreviation}
					color={opponent.color}
					logoUrl={opponent.logoUrl}
				/>
			</span>
			<span className={css({ textStyle: "label", fontWeight: "bold" })}>
				Were You Watching? · {watchGameDay(gameStartsAt)} · {league}
			</span>
		</div>
	)
}
