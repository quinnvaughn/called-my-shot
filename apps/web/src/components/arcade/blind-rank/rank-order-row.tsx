import { css } from "styled-system/css"
import { RankItemFace, type RankItemView } from "./rank-item-face"

// One place in a finished day's true order: the slot, who or what, and the
// value it's ranked by.
export function RankOrderRow({
	slot,
	item,
	display,
}: {
	slot: number
	item: RankItemView
	display: string
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
			<RankItemFace item={item} />
			<span className={css({ fontFamily: "heading" })}>{display}</span>
		</li>
	)
}
