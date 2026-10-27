import { css } from "styled-system/css"
import { WatchCountdown } from "./watch-countdown"
import { WatchOptionButton } from "./watch-option-button"
import type { WatchServed } from "./watch-run"

// The question on the clock: its prompt, the clock, and four choices.
export function WatchQuestionCard({
	question,
	deadline,
	total,
	secondsPerQuestion,
	pending,
	onChoose,
}: {
	question: WatchServed
	deadline: number
	total: number
	secondsPerQuestion: number
	pending: boolean
	onChoose: (choice: number | null) => void
}) {
	return (
		<section
			aria-label={`Question ${question.index + 1} of ${total}`}
			className={css({ display: "flex", flexDirection: "column", gap: "4" })}
		>
			<span className={css({ textStyle: "label", color: "fg.muted" })}>
				Question {question.index + 1} of {total}
			</span>
			<h2
				className={css({
					fontFamily: "heading",
					fontSize: { base: "2xl", md: "3xl" },
					lineHeight: "1.1",
				})}
			>
				{question.prompt}
			</h2>
			<WatchCountdown
				deadline={deadline}
				totalMs={secondsPerQuestion * 1000}
				onExpire={() => onChoose(null)}
			/>
			<div
				className={css({
					display: "grid",
					gridTemplateColumns: { base: "1fr", sm: "1fr 1fr" },
					gap: "2",
				})}
			>
				{question.options.map((option, i) => (
					<WatchOptionButton
						key={option.label}
						option={option}
						disabled={pending}
						onChoose={() => onChoose(i)}
					/>
				))}
			</div>
		</section>
	)
}
