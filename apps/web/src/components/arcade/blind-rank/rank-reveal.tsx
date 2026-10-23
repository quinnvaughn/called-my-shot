import { rankResultHeadline, rankResultLine } from "@called-my-shot/schemas"
import { css } from "styled-system/css"
import { ArcadeCountdown } from "#/components/arcade/arcade-countdown"
import { ArcadeShareRow } from "#/components/arcade/arcade-share-row"
import { GuessSquares } from "#/components/arcade/name-that-season/guess-squares"
import { seasonDateLabel } from "#/components/arcade/name-that-season/season-result"
import { track } from "#/lib/analytics"
import { RankAnswerRow } from "./rank-answer-row"
import type { RankItemView } from "./rank-item-face"

type Slot = {
	slot: number
	correct?: boolean | null
	placed?: RankItemView | null
	answer?: { display: string; item: RankItemView } | null
}

// The end of a game, in the game's color: how many landed, the squares, the
// true order with each value and where the player went wrong, and the share
// that sends it.
export function RankReveal({
	date,
	league,
	prompt,
	context,
	slots,
	correctCount,
	nextPuzzleAt,
	resultUrl,
}: {
	date: string
	league: string
	prompt: string
	context: string
	slots: Slot[]
	correctCount: number
	nextPuzzleAt: string | null
	// The full link this result shares, ?by= included.
	resultUrl: string
}) {
	const day = seasonDateLabel(date)
	return (
		<section
			aria-label="Result"
			className={css({
				display: "flex",
				flexDirection: "column",
				gap: { base: "5", md: "6" },
				padding: { base: "5", md: "8" },
				borderRadius: "2xl",
				bg: "rank.default",
				color: "rank.ink",
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
					Blind Rank · {day} · {league}
				</span>
				{nextPuzzleAt && (
					<ArcadeCountdown nextPuzzleAt={nextPuzzleAt} noun="rank" />
				)}
			</div>

			<div
				className={css({ display: "flex", flexDirection: "column", gap: "2" })}
			>
				<span className={css({ fontSize: "md", fontWeight: "semibold" })}>
					{prompt} · {context}
				</span>
				<h1
					className={css({
						fontFamily: "heading",
						fontSize: { base: "4xl", md: "6xl" },
						lineHeight: "0.95",
					})}
				>
					{rankResultHeadline(correctCount)}
				</h1>
				<p
					className={css({
						fontSize: { base: "lg", md: "xl" },
						fontWeight: "semibold",
					})}
				>
					{rankResultLine(correctCount)}
				</p>
			</div>

			<GuessSquares
				size="lg"
				squares={slots.map((s) => (s.correct ? "hit" : "miss"))}
			/>

			<div
				className={css({
					display: "flex",
					flexDirection: "column",
					gap: "4",
					padding: { base: "2", md: "3" },
					borderRadius: "xl",
					bg: "bg.canvas",
					color: "fg.default",
				})}
			>
				<ol className={css({ display: "flex", flexDirection: "column" })}>
					{slots.map((s) =>
						s.answer ? (
							<RankAnswerRow
								key={s.slot}
								slot={s.slot}
								answer={s.answer.item}
								display={s.answer.display}
								placed={s.placed ?? null}
								correct={s.correct === true}
							/>
						) : null,
					)}
				</ol>
				<div
					className={css({ padding: "{spacing.0} {spacing.2} {spacing.2}" })}
				>
					<ArcadeShareRow
						game="rank"
						url={resultUrl}
						title={`Blind Rank · ${day}`}
						tweetText={`${rankResultHeadline(correctCount)} on ${day}'s Blind Rank: ${prompt}. Can you do better?`}
						onShared={(method) =>
							track("rank_result_shared", { date, method, toGroup: false })
						}
					/>
				</div>
			</div>
		</section>
	)
}
