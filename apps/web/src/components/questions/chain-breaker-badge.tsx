import { css } from "styled-system/css"

// This call's miss broke a chain: every hit in it scored 0. Shown wherever
// the call appears, for as long as the chain stands broken on it, since that
// is the part of the record the rest of the group remembers.
export function ChainBreakerBadge() {
	return (
		<span
			className={css({
				textStyle: "label",
				fontWeight: "bold",
				color: "danger.default",
				border: "1px solid {colors.danger.default}",
				padding: "{spacing.0.5} {spacing.1.5}",
				borderRadius: "sm",
				whiteSpace: "nowrap",
			})}
		>
			Broke the chain
		</span>
	)
}
