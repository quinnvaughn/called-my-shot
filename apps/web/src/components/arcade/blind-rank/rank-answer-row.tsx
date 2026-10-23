import { FiCheck, FiX } from "react-icons/fi"
import { css } from "styled-system/css"
import { RankItemFace, type RankItemView } from "./rank-item-face"

// One slot of a finished game, top first: what belonged there with its
// value, and whether the player put it there (and if not, what they did).
export function RankAnswerRow({
	slot,
	answer,
	display,
	placed,
	correct,
}: {
	slot: number
	answer: RankItemView
	display: string
	placed: RankItemView | null
	correct: boolean
}) {
	return (
		<li
			className={css({
				display: "grid",
				gridTemplateColumns: "1.5rem 1fr auto",
				alignItems: "center",
				gap: "3",
				padding: "{spacing.3} {spacing.4}",
				"&:not(:last-child)": {
					borderBottom: "1px solid {colors.border.default}",
				},
			})}
		>
			<span className={css({ textStyle: "metaLg", color: "fg.muted" })}>
				{slot}
			</span>
			<span
				className={css({
					display: "flex",
					flexDirection: "column",
					gap: "1",
					minWidth: 0,
				})}
			>
				<RankItemFace item={answer} />
				{!correct && placed && (
					<span className={css({ fontSize: "xs", color: "danger.default" })}>
						You had {placed.label} here
					</span>
				)}
			</span>
			<span
				className={css({
					display: "flex",
					alignItems: "center",
					gap: "2",
					fontFamily: "heading",
					fontSize: "md",
				})}
			>
				{display}
				{correct ? (
					<FiCheck
						aria-label="right"
						className={css({ color: "success.default" })}
					/>
				) : (
					<FiX
						aria-label="wrong"
						className={css({ color: "danger.default" })}
					/>
				)}
			</span>
		</li>
	)
}
