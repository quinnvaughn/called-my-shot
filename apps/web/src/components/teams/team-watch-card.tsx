import { teamNickname } from "@called-my-shot/schemas"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { watchGameDay } from "#/components/arcade/were-you-watching/watch-codes"
import { watchTeamQuizQuery } from "#/graphql/were-you-watching/queries"

// The team's Were You Watching? quiz on its own space: the game it's on and
// how the viewer did, in the game's color. Nothing when there's no game
// recent enough to quiz on.
export function TeamWatchCard({
	leagueSlug,
	teamSlug,
}: {
	leagueSlug: string
	teamSlug: string
}) {
	const { data } = useQuery(watchTeamQuizQuery(leagueSlug, teamSlug))
	const entry = data?.watchTeamQuiz
	const quiz = entry?.status === "LIVE" ? entry.quiz : null
	if (!quiz) return null
	const play = quiz.viewerPlay

	return (
		<Link
			to="/arcade/were-you-watching/$leagueSlug/$teamSlug"
			params={{ leagueSlug, teamSlug }}
			className={css({
				display: "flex",
				alignItems: "center",
				justifyContent: "space-between",
				gap: "3",
				flexWrap: "wrap",
				padding: "{spacing.4} {spacing.5}",
				borderRadius: "xl",
				bg: "watch.default",
				color: "watch.ink",
				transition: "transform 0.15s ease",
				_hover: { transform: "translateY(-2px)" },
			})}
		>
			<span
				className={css({ display: "flex", flexDirection: "column", gap: "1" })}
			>
				<span className={css({ textStyle: "label", fontWeight: "bold" })}>
					Were You Watching? · {watchGameDay(quiz.gameStartsAt)}
				</span>
				<span className={css({ fontWeight: "semibold" })}>
					{quiz.questionCount} questions on the {teamNickname(quiz.team.name)}{" "}
					vs the {teamNickname(quiz.opponent.name)}
				</span>
			</span>
			<span className={css({ fontFamily: "heading", fontSize: "lg" })}>
				{play?.status === "DONE"
					? `${play.correctCount} of ${play.total}`
					: play
						? "Keep going"
						: "Take the quiz"}
			</span>
		</Link>
	)
}
