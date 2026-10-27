import { css } from "styled-system/css"

// One pick who wasn't a teammate of the chain's last player at the time.
export function ChainMissChip({ name }: { name: string }) {
	return (
		<li
			className={css({
				display: "inline-flex",
				alignItems: "center",
				padding: "{spacing.1} {spacing.2.5}",
				borderRadius: "full",
				bg: "danger.subtle",
				color: "fg.default",
				border: "1px solid {colors.danger.default}",
				fontSize: "xs",
				fontWeight: "medium",
			})}
		>
			{name}
		</li>
	)
}
