import type { ReactNode } from "react"
import { css } from "styled-system/css"

// A number with its icon beside a finished chain: the time, the hints, the
// misses. `label` is what it means read aloud ("2 misses").
export function ChainStatChip({
	icon,
	value,
	label,
}: {
	icon: ReactNode
	value: string
	label: string
}) {
	return (
		<span
			role="img"
			aria-label={label}
			className={css({
				display: "inline-flex",
				alignItems: "center",
				gap: "1.5",
				padding: "{spacing.1} {spacing.2.5}",
				borderRadius: "full",
				bg: "bg.canvas",
				color: "fg.default",
				fontFamily: "mono",
				fontSize: "sm",
				fontVariantNumeric: "tabular-nums",
			})}
		>
			{icon}
			<span aria-hidden>{value}</span>
		</span>
	)
}
