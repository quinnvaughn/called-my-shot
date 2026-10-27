import { possessive, teamNickname } from "@called-my-shot/schemas"
import { css } from "styled-system/css"
import { Button } from "#/components/ui/button"
import { watchGameDay } from "./watch-codes"

// Before the first question: what game it's on and how it plays. Nothing
// about the questions shows until Start puts the first on the clock.
export function WatchStartPanel({
	teamName,
	opponentName,
	gameStartsAt,
	league,
	questionCount,
	secondsPerQuestion,
	signedIn,
	pending,
	error,
	onStart,
}: {
	teamName: string
	opponentName: string
	gameStartsAt: string
	league: string
	questionCount: number
	secondsPerQuestion: number
	signedIn: boolean
	pending: boolean
	error: string | null
	onStart: () => void
}) {
	const team = teamNickname(teamName)
	const day = watchGameDay(gameStartsAt)
	return (
		<section
			aria-label="Were You Watching?"
			className={css({
				display: "flex",
				flexDirection: "column",
				gap: "5",
				padding: { base: "5", md: "8" },
				borderRadius: "2xl",
				bg: "watch.default",
				color: "watch.ink",
			})}
		>
			<span className={css({ textStyle: "label", fontWeight: "bold" })}>
				Were You Watching? · {day} · {league}
			</span>
			<h1
				className={css({
					fontFamily: "heading",
					fontSize: { base: "3xl", md: "5xl" },
					lineHeight: "1",
				})}
			>
				{team} vs {teamNickname(opponentName)}
			</h1>
			<ul
				className={css({
					display: "flex",
					flexDirection: "column",
					gap: "2",
					fontSize: "sm",
					fontWeight: "medium",
					listStyle: "disc",
					paddingLeft: "5",
				})}
			>
				<li>
					{questionCount} questions on the {possessive(team)} {day} game against
					the {teamNickname(opponentName)}, straight from the box score.
				</li>
				<li>
					You get {secondsPerQuestion} seconds per question, from when it
					appears. Running out counts as a miss.
				</li>
				<li>Stay on this tab the whole way for a Clean run tag.</li>
				<li>
					One try.{" "}
					{signedIn
						? "Most right wins the board, and time breaks ties."
						: "Sign up after and your score goes on the board."}
				</li>
			</ul>
			{error && (
				<p className={css({ fontWeight: "semibold" })} role="alert">
					{error}
				</p>
			)}
			<Button
				variant="solid"
				size="lg"
				loading={pending}
				onClick={onStart}
				className={css({ alignSelf: "flex-start" })}
			>
				Start
			</Button>
		</section>
	)
}
