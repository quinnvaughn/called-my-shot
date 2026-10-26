import { seasonResultLine } from "@called-my-shot/schemas"
import { css } from "styled-system/css"
import { ArcadeCountdown } from "#/components/arcade/arcade-countdown"
import { ArcadeShareRow } from "#/components/arcade/arcade-share-row"
import { TeamBadge } from "#/components/ui/team-badge"
import { track } from "#/lib/analytics"
import { GuessSquares } from "./guess-squares"
import {
	type SeasonOutcome,
	seasonDateLabel,
	seasonGuessCount,
	seasonResultHeadline,
	seasonShareDare,
	seasonSquares,
} from "./season-result"

type Answer = {
	label: string
	// The team's name that season, "Houston Oilers".
	name: string
	team: {
		abbreviation: string
		color: string
		logoUrl?: string | null
	}
}

// The end of a game, in the game's color: how it went, the squares, the
// season it was, and the share that sends it.
export function SeasonReveal({
	date,
	league,
	answer,
	outcomes,
	nextPuzzleAt,
	resultUrl,
}: {
	date: string
	league: string
	answer: Answer
	outcomes: SeasonOutcome[]
	nextPuzzleAt: string | null
	// The full link this result shares, ?by= included.
	resultUrl: string
}) {
	const guessCount = seasonGuessCount(outcomes)
	return (
		<section
			aria-label="Result"
			className={css({
				display: "flex",
				flexDirection: "column",
				gap: { base: "5", md: "6" },
				padding: { base: "5", md: "8" },
				borderRadius: "2xl",
				bg: "season.default",
				color: "season.ink",
			})}
		>
			<div
				className={css({
					display: "flex",
					justifyContent: "space-between",
					gap: "3",
					flexWrap: "wrap",
					textStyle: "label",
					fontWeight: "bold",
				})}
			>
				<span>
					Name That Season · {seasonDateLabel(date)} · {league}
				</span>
				{nextPuzzleAt && (
					<ArcadeCountdown nextPuzzleAt={nextPuzzleAt} noun="season" />
				)}
			</div>

			<h1
				className={css({
					fontFamily: "heading",
					fontSize: { base: "4xl", md: "6xl" },
					lineHeight: "0.95",
				})}
			>
				{seasonResultHeadline(guessCount)}
			</h1>
			<p
				className={css({
					marginTop: { base: "-3", md: "-4" },
					fontSize: { base: "lg", md: "xl" },
					fontWeight: "semibold",
				})}
			>
				{seasonResultLine(guessCount)}
			</p>

			<GuessSquares size="lg" squares={seasonSquares(outcomes)} />

			<div
				className={css({
					display: "flex",
					flexDirection: "column",
					gap: "4",
					padding: { base: "4", md: "5" },
					borderRadius: "xl",
					bg: "bg.canvas",
					color: "fg.default",
				})}
			>
				<div
					className={css({ display: "flex", alignItems: "center", gap: "4" })}
				>
					<span
						className={css({
							display: "flex",
							flexShrink: 0,
							padding: "2",
							borderRadius: "xl",
							bg: "white",
						})}
					>
						<TeamBadge
							abbreviation={answer.team.abbreviation}
							color={answer.team.color}
							logoUrl={answer.team.logoUrl}
							size="lg"
						/>
					</span>
					<div
						className={css({
							display: "flex",
							flexDirection: "column",
							gap: "1",
							minWidth: 0,
						})}
					>
						<span className={css({ textStyle: "label", color: "fg.muted" })}>
							{guessCount === null ? "It was the" : "You named the"}
						</span>
						<h2
							className={css({
								fontFamily: "heading",
								fontSize: { base: "xl", md: "3xl" },
								lineHeight: "1.05",
								overflowWrap: "anywhere",
							})}
						>
							{answer.label} {answer.name}
						</h2>
					</div>
				</div>
				<ArcadeShareRow
					game="season"
					dare={seasonShareDare(guessCount)}
					url={resultUrl}
					title={`Name That Season · ${seasonDateLabel(date)}`}
					tweetText={
						guessCount === null
							? `Couldn't name ${seasonDateLabel(date)}'s season. Can you?`
							: `Named ${seasonDateLabel(date)}'s season in ${guessCount}. Can you?`
					}
					onShared={(method) =>
						track("season_result_shared", { date, method, toGroup: false })
					}
				/>
			</div>
		</section>
	)
}
