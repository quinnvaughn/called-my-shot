import { rankResultHeadline } from "@called-my-shot/schemas"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { GuessSquares } from "#/components/arcade/name-that-season/guess-squares"
import { seasonDateLabel } from "#/components/arcade/name-that-season/season-result"
import { rankPuzzleTodayQuery } from "#/graphql/blind-rank/queries"
import { useMe } from "#/hooks/use-me"
import { RANK_SLOTS } from "./rank-result"

// Today's Blind Rank on the Arcade hub, in the game's color: what's ranked,
// whether the viewer has played it yet, and how it went if they have.
export function BlindRankHubCard() {
	const me = useMe()
	const { data } = useQuery(rankPuzzleTodayQuery)
	const puzzle = data?.rankPuzzleToday
	const play = me ? puzzle?.viewerPlay : null
	const done = play?.status === "DONE"
	const placed = play?.slots.filter((s) => s.placed).length ?? 0

	return (
		<Link
			to="/arcade/blind-rank"
			className={css({
				display: "flex",
				flexDirection: "column",
				gap: "4",
				padding: { base: "5", md: "6" },
				borderRadius: "2xl",
				bg: "rank.default",
				color: "rank.ink",
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
				Blind Rank
			</h2>
			<p className={css({ fontSize: "sm", fontWeight: "medium" })}>
				{puzzle ? `Today: ${puzzle.prompt} · ${puzzle.context}. ` : ""}
				Five things, one at a time. Rank each before you see the next, and you
				can't move them once they're placed.
			</p>
			<div
				className={css({
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					gap: "3",
					flexWrap: "wrap",
					marginTop: "auto",
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
					<GuessSquares
						squares={Array.from({ length: RANK_SLOTS }, (_, i) => {
							const slot = play?.slots[i]
							if (!done || !slot) return "empty"
							return slot.correct ? "hit" : "miss"
						})}
					/>
				</span>
				<span className={css({ fontFamily: "heading", fontSize: "lg" })}>
					{!puzzle
						? "No Blind Rank today"
						: done
							? rankResultHeadline(play?.correctCount ?? 0)
							: placed > 0
								? "Keep going"
								: "Play"}
				</span>
			</div>
		</Link>
	)
}
