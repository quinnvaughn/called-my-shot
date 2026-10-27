import {
	possessive,
	teamNickname,
	watchResultHeadline,
	watchResultLine,
} from "@called-my-shot/schemas"
import { FiClock } from "react-icons/fi"
import { css } from "styled-system/css"
import { ArcadeShareRow } from "#/components/arcade/arcade-share-row"
import { ChainStatChip } from "#/components/arcade/teammate-chain/chain-stat-chip"
import { SectionLabel } from "#/components/ui/section-label"
import type { ShareMethod } from "#/lib/share-links"
import { WatchAnswerRow } from "./watch-answer-row"
import { WatchCleanTag } from "./watch-clean-tag"
import type { WatchRunView } from "./watch-run"

function ordinal(n: number): string {
	const tens = n % 100
	if (tens >= 11 && tens <= 13) return `${n}th`
	return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`
}

// A finished run: how many right, how fast, where it ranks, every question
// with its answer, and the dare to send.
export function WatchResult({
	view,
	teamName,
	opponentName,
	playerCount,
	resultUrl,
	onShared,
}: {
	view: WatchRunView
	teamName: string
	opponentName: string
	playerCount: number
	resultUrl: string
	onShared: (method: ShareMethod) => void
}) {
	const team = teamNickname(teamName)
	const seconds = (view.totalMs / 1000).toFixed(1)
	const dare =
		view.correct === view.total
			? `You didn't miss a thing on the ${team}. Can your friends say the same?`
			: `Can your friends beat ${view.correct} of ${view.total}?`
	return (
		<div
			className={css({ display: "flex", flexDirection: "column", gap: "6" })}
		>
			<section
				aria-label="Your result"
				className={css({
					display: "flex",
					flexDirection: "column",
					gap: "4",
					padding: { base: "5", md: "7" },
					borderRadius: "2xl",
					bg: "watch.default",
					color: "watch.ink",
				})}
			>
				<span className={css({ textStyle: "label", fontWeight: "bold" })}>
					Were You Watching? · {team} vs {teamNickname(opponentName)}
				</span>
				<h1
					className={css({
						fontFamily: "heading",
						fontSize: { base: "3xl", md: "5xl" },
						lineHeight: "1",
					})}
				>
					{watchResultHeadline(view.correct, view.total)}
				</h1>
				<p
					className={css({
						fontSize: "sm",
						fontWeight: "medium",
						opacity: 0.85,
					})}
				>
					{watchResultLine(view.correct, view.total)}
				</p>
				<div
					className={css({
						display: "flex",
						alignItems: "center",
						gap: "2",
						flexWrap: "wrap",
					})}
				>
					<ChainStatChip
						icon={<FiClock aria-hidden size={14} />}
						value={`${seconds}s`}
						label={`Time ${seconds} seconds`}
					/>
					{view.clean && <WatchCleanTag />}
				</div>
				{view.rank !== null && (
					<p className={css({ fontSize: "sm", fontWeight: "medium" })}>
						{ordinal(view.rank)} on the {possessive(team)} board so far, out of{" "}
						{playerCount}.
					</p>
				)}
				<div
					className={css({
						display: "flex",
						flexDirection: "column",
						gap: "4",
						padding: { base: "3", md: "4" },
						borderRadius: "xl",
						bg: "bg.canvas",
						color: "fg.default",
					})}
				>
					<div className={css({ display: "flex", flexDirection: "column" })}>
						<SectionLabel>Your answers</SectionLabel>
						{view.answered.map((answered) => (
							<WatchAnswerRow key={answered.index} answered={answered} />
						))}
					</div>
					<ArcadeShareRow
						game="watch"
						dare={dare}
						url={resultUrl}
						title={`Were You Watching? · ${team}`}
						tweetText={`${view.correct} of ${view.total} on the ${possessive(team)} last game in ${seconds}s. Were you watching?`}
						onShared={onShared}
					/>
				</div>
			</section>
		</div>
	)
}
