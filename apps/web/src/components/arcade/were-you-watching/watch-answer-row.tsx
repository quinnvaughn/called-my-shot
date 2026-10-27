import { css } from "styled-system/css"
import type { WatchAnswered } from "./watch-run"

// One question on the result screen: what it asked, the answer, and how the
// player did on it.
export function WatchAnswerRow({ answered }: { answered: WatchAnswered }) {
	const answer = answered.options[answered.answer]?.label ?? ""
	return (
		<div
			className={css({
				display: "flex",
				gap: "3",
				padding: "{spacing.3} {spacing.4}",
				"&:not(:last-child)": {
					borderBottom: "1px solid {colors.border.default}",
				},
			})}
		>
			<span
				role="img"
				aria-label={answered.correct ? "Right" : "Wrong"}
				className={css({
					fontFamily: "heading",
					color: answered.correct ? "success.default" : "danger.default",
					flexShrink: 0,
					width: "5",
				})}
			>
				{answered.correct ? "✓" : "✗"}
			</span>
			<div
				className={css({
					display: "flex",
					flexDirection: "column",
					gap: "1",
					minWidth: 0,
				})}
			>
				<span className={css({ fontWeight: "semibold" })}>
					{answered.prompt}
				</span>
				<span className={css({ fontSize: "sm", color: "fg.body" })}>
					{answer}. {answered.reveal}
				</span>
				<span className={css({ textStyle: "labelSm", color: "fg.muted" })}>
					{answered.timedOut
						? "Time ran out"
						: answered.correct
							? `Got it in ${answered.seconds.toFixed(1)}s`
							: `Picked ${answered.options[answered.choice ?? 0]?.label ?? ""}`}
				</span>
			</div>
		</div>
	)
}
