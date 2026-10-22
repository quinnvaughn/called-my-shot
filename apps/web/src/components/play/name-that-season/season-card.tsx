import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { ClueRow } from "./clue-row"
import { SEASON_MAX_GUESSES, seasonDateLabel } from "./season-result"

// The day's season, in the game's color: the clues earned so far, and a slot
// for each one still locked. Never a team's colors, so nothing on it hints at
// the answer beyond the league.
export function SeasonCard({
	date,
	league,
	clues,
	freshIndex,
	footer,
}: {
	date: string
	// "NFL": every guess is a franchise from this league.
	league: string
	clues: string[]
	// The clue the last wrong guess revealed, highlighted until the next one.
	freshIndex: number | null
	footer?: ReactNode
}) {
	return (
		<section
			aria-label="The season"
			className={css({
				display: "flex",
				flexDirection: "column",
				gap: "5",
				padding: { base: "5", md: "6" },
				borderRadius: "2xl",
				bg: "season.default",
				color: "season.ink",
			})}
		>
			<div
				className={css({
					display: "flex",
					justifyContent: "space-between",
					alignItems: "baseline",
					gap: "3",
					textStyle: "label",
					fontWeight: "bold",
				})}
			>
				<span>Name That Season</span>
				<span>
					{seasonDateLabel(date)} · {league}
				</span>
			</div>
			<h1
				className={css({
					fontFamily: "heading",
					fontSize: { base: "3xl", md: "4xl" },
					lineHeight: "1",
				})}
			>
				Which season is this?
			</h1>
			<ol
				className={css({
					display: "flex",
					flexDirection: "column",
					gap: "2",
				})}
			>
				{Array.from({ length: SEASON_MAX_GUESSES }, (_, i) => (
					<ClueRow
						// biome-ignore lint/suspicious/noArrayIndexKey: clues are positional and never reorder
						key={i}
						number={i + 1}
						text={clues[i] ?? null}
						fresh={i === freshIndex}
					/>
				))}
			</ol>
			{footer}
		</section>
	)
}
