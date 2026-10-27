import { css } from "styled-system/css"
import { Button } from "#/components/ui/button"
import { WatchOptionButton } from "./watch-option-button"
import type { WatchAnswered } from "./watch-run"

// After an answer: how it went, what the box score said, and the button on
// to the next question, or to the result after the last one.
export function WatchAnswerReveal({
	answered,
	total,
	pending,
	onNext,
	nextLabel = "Next question",
}: {
	answered: WatchAnswered
	total: number
	pending: boolean
	onNext: () => void
	nextLabel?: string
}) {
	return (
		<section
			aria-label={`Question ${answered.index + 1} answered`}
			className={css({ display: "flex", flexDirection: "column", gap: "4" })}
		>
			<span className={css({ textStyle: "label", color: "fg.muted" })}>
				Question {answered.index + 1} of {total}
			</span>
			<h2
				className={css({
					fontFamily: "heading",
					fontSize: { base: "2xl", md: "3xl" },
					lineHeight: "1.1",
				})}
			>
				{answered.prompt}
			</h2>
			<p
				className={css({
					fontFamily: "heading",
					fontSize: "xl",
					color: answered.correct ? "success.default" : "danger.default",
				})}
			>
				{answered.correct
					? "Got it"
					: answered.timedOut
						? "Time ran out"
						: "Not quite"}
			</p>
			<div
				className={css({
					display: "grid",
					gridTemplateColumns: { base: "1fr", sm: "1fr 1fr" },
					gap: "2",
				})}
			>
				{answered.options.map((option, i) => (
					<WatchOptionButton
						key={option.label}
						option={option}
						state={
							i === answered.answer
								? "right"
								: i === answered.choice
									? "picked_wrong"
									: "other"
						}
					/>
				))}
			</div>
			<p className={css({ color: "fg.body" })}>{answered.reveal}</p>
			<Button
				variant="solid"
				size="lg"
				loading={pending}
				onClick={onNext}
				className={css({ alignSelf: "flex-start" })}
			>
				{nextLabel}
			</Button>
		</section>
	)
}
