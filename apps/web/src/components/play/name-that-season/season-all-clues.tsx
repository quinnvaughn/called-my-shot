import { css } from "styled-system/css"
import { ClueRow } from "./clue-row"

// Every clue of a finished game, folded away under the result.
export function SeasonAllClues({ clues }: { clues: string[] }) {
	return (
		<details
			className={css({
				borderRadius: "xl",
				border: "1px solid {colors.border.default}",
				padding: "4",
			})}
		>
			<summary
				className={css({
					cursor: "pointer",
					textStyle: "label",
					color: "fg.muted",
				})}
			>
				All six clues
			</summary>
			<ol
				className={css({
					display: "flex",
					flexDirection: "column",
					gap: "2",
					marginTop: "3",
				})}
			>
				{clues.map((clue, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: clues are positional and never reorder
					<ClueRow key={i} number={i + 1} text={clue} />
				))}
			</ol>
		</details>
	)
}
