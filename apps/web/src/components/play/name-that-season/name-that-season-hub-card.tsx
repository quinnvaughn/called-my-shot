import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { seasonPuzzleTodayQuery } from "#/graphql/season-puzzles/queries"
import { useMe } from "#/hooks/use-me"
import { GuessSquares } from "./guess-squares"
import {
	seasonDateLabel,
	seasonResultHeadline,
	seasonSquares,
} from "./season-result"

// Today's Name That Season on the Play hub, in the game's color: whether the
// viewer has played it yet, and how it went if they have.
export function NameThatSeasonHubCard() {
	const me = useMe()
	const { data } = useQuery(seasonPuzzleTodayQuery)
	const puzzle = data?.seasonPuzzleToday
	const play = me ? puzzle?.viewerPlay : null
	const outcomes = play?.guesses.map((g) => g.outcome) ?? []
	const finished = play && play.status !== "PLAYING"
	const started = (play?.guesses.length ?? 0) > 0

	return (
		<Link
			to="/play/name-that-season"
			className={css({
				display: "flex",
				flexDirection: "column",
				gap: "4",
				padding: { base: "5", md: "6" },
				borderRadius: "2xl",
				bg: "season.default",
				color: "season.ink",
				transition: "transform 0.15s ease",
				_hover: { transform: "translateY(-2px)" },
			})}
		>
			<div
				className={css({
					display: "flex",
					justifyContent: "space-between",
					gap: "3",
					textStyle: "label",
					fontWeight: "bold",
				})}
			>
				<span>Daily</span>
				{puzzle && (
					<span>
						{seasonDateLabel(puzzle.date)} · {puzzle.league.abbreviation}
					</span>
				)}
			</div>
			<h2
				className={css({
					fontFamily: "heading",
					fontSize: { base: "3xl", md: "4xl" },
					lineHeight: "1",
				})}
			>
				Name That Season
			</h2>
			<p className={css({ fontSize: "sm", fontWeight: "medium" })}>
				Name the team and the year from its record, its stat leaders and how its
				season ended. Each wrong guess reveals another clue. The right team in
				the wrong year tells you to go earlier or later.
			</p>
			<div
				className={css({
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					gap: "3",
					flexWrap: "wrap",
				})}
			>
				<span
					className={css({
						display: "flex",
						padding: "2",
						borderRadius: "lg",
						bg: "bg.canvas",
					})}
				>
					<GuessSquares squares={seasonSquares(outcomes)} />
				</span>
				<span className={css({ fontFamily: "heading", fontSize: "lg" })}>
					{!puzzle
						? "No season today"
						: finished
							? seasonResultHeadline(play.guessCount ?? null)
							: started
								? "Keep going"
								: "Play"}
				</span>
			</div>
		</Link>
	)
}
