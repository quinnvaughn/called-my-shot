import { css } from "styled-system/css"

// This call was taken back and re-made. Shown wherever a call appears,
// including after it resolves: a redo is part of the record, not a detail of
// how the record was entered, and hiding it once the result is in would make
// the badge a warning rather than a fact.
//
// Deliberately states only that a redo happened. What the call used to say is
// on the call's own page, which is where there's room to put the two side by
// side and where someone has gone looking.
export function RedoBadge() {
	return (
		<span
			className={css({
				textStyle: "label",
				fontWeight: "bold",
				color: "fg.subtle",
				border: "1px solid {colors.border.emphasized}",
				padding: "{spacing.0.5} {spacing.1.5}",
				borderRadius: "sm",
				whiteSpace: "nowrap",
			})}
		>
			Redo
		</span>
	)
}
