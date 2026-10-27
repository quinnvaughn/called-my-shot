import { teamNickname } from "@called-my-shot/schemas"
import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { Tag } from "#/components/ui/tag"
import { TeamBadge } from "#/components/ui/team-badge"
import { teamSlug } from "#/lib/team-slug"
import { watchGameDay } from "./watch-codes"

type Entry = {
	status: "LIVE" | "STALE" | "NONE"
	team: {
		name: string
		abbreviation: string
		color: string
		logoUrl?: string | null
	}
	quiz?: {
		gameStartsAt: string
		questionCount: number
		opponent: { abbreviation: string }
		viewerRun?: { finished: boolean; correct: number } | null
	} | null
}

// One team in the picker, with the game its quiz is on and, once the viewer
// has taken it, how they did. A team with no recent game is greyed out but
// still opens, to its last quiz's board.
export function WatchTeamTile({
	entry,
	leagueSlug,
}: {
	entry: Entry
	leagueSlug: string
}) {
	const { team, quiz } = entry
	const live = entry.status === "LIVE"
	const run = live ? quiz?.viewerRun : null
	return (
		<Link
			to="/arcade/were-you-watching/$leagueSlug/$teamSlug"
			params={{ leagueSlug, teamSlug: teamSlug(team.abbreviation) }}
			data-live={live}
			className={css({
				display: "flex",
				alignItems: "center",
				gap: "3",
				padding: "{spacing.3} {spacing.4}",
				borderRadius: "xl",
				bg: "bg.surface",
				border: "1px solid {colors.border.default}",
				transition: "border-color 0.1s ease",
				_hover: { borderColor: "primary.default" },
				"&[data-live=false]": { opacity: 0.55 },
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
					minWidth: 0,
				})}
			>
				<span className={css({ fontWeight: "semibold" })}>
					{teamNickname(team.name)}
				</span>
				<span className={css({ textStyle: "labelSm", color: "fg.muted" })}>
					{live && quiz
						? `vs ${quiz.opponent.abbreviation} · ${watchGameDay(quiz.gameStartsAt)}`
						: "No recent game"}
				</span>
			</span>
			{run && (
				<span className={css({ marginLeft: "auto", flexShrink: 0 })}>
					<Tag variant={run.finished ? "secondary" : "neutral"} size="sm">
						{run.finished
							? `${run.correct} of ${quiz?.questionCount}`
							: "Keep going"}
					</Tag>
				</span>
			)}
		</Link>
	)
}
