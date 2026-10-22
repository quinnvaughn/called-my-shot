import { css, cva } from "styled-system/css"
import type { SeasonSquare } from "./season-result"

const square = cva({
	base: {
		flexShrink: 0,
		borderRadius: "md",
		transition: "background-color 0.2s ease, border-color 0.2s ease",
	},
	variants: {
		fill: {
			hit: {
				bg: "success.default",
				border: "2px solid {colors.success.default}",
			},
			close: {
				bg: "warning.default",
				border: "2px solid {colors.warning.default}",
			},
			miss: {
				bg: "danger.default",
				border: "2px solid {colors.danger.default}",
			},
			next: {
				bg: "bg.subtle",
				border: "2px solid {colors.fg.default}",
			},
			empty: {
				bg: "bg.subtle",
				border: "2px solid {colors.border.emphasized}",
			},
		},
		size: {
			sm: { width: "4", height: "4", borderRadius: "sm" },
			md: { width: "7", height: "7" },
			lg: { width: "11", height: "11", borderRadius: "lg" },
		},
	},
})

const LABELS: Record<SeasonSquare, string> = {
	hit: "right season",
	close: "right team, wrong year",
	miss: "wrong team",
	next: "next guess",
	empty: "unused",
}

export function GuessSquares({
	squares,
	size = "md",
}: {
	squares: SeasonSquare[]
	size?: "sm" | "md" | "lg"
}) {
	return (
		<div
			role="img"
			aria-label={squares.map((s) => LABELS[s]).join(", ")}
			className={css({
				display: "flex",
				gap: size === "sm" ? "1" : "2",
			})}
		>
			{squares.map((fill, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: squares are positional and never reorder
				<span key={i} className={square({ fill, size })} />
			))}
		</div>
	)
}
