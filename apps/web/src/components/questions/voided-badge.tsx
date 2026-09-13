import { css } from "styled-system/css"

// Settled with no result - the counterpart to LockedBadge for a question that
// won't be getting one. Shared by the card status slots.
export function VoidedBadge() {
	return (
		<span
			className={css({
				fontFamily: "mono",
				fontSize: "2xs",
				fontWeight: "bold",
				letterSpacing: "wide",
				textTransform: "uppercase",
				color: "fg.subtle",
				backgroundColor: "bg.subtle",
				padding: "{spacing.1} {spacing.2}",
				borderRadius: "sm",
				whiteSpace: "nowrap",
			})}
		>
			Voided
		</span>
	)
}
