import { cva } from "styled-system/css"

const button = cva({
	base: {
		padding: "{spacing.2} {spacing.1}",
		borderRadius: "md",
		bg: "bg.surface",
		fontSize: "sm",
		fontWeight: "medium",
		fontVariantNumeric: "tabular-nums",
		color: "fg.default",
		cursor: "pointer",
		transition: "border-color 0.15s ease, background-color 0.15s ease",
		_hover: { bg: "bg.subtle" },
		_disabled: {
			cursor: "not-allowed",
			color: "fg.muted",
			textDecoration: "line-through",
			opacity: 0.5,
			_hover: { bg: "bg.surface" },
		},
	},
	variants: {
		selected: {
			true: { border: "1px solid {colors.primary.default}", bg: "bg.subtle" },
			false: { border: "1px solid {colors.border.default}" },
		},
	},
})

// One season of the picked franchise. Struck through and off limits once a
// guess has ruled it out: already guessed, or on the wrong side of an arrow.
export function SeasonYearButton({
	label,
	selected,
	ruledOut,
	disabled,
	onSelect,
}: {
	label: string
	selected: boolean
	ruledOut: boolean
	disabled: boolean
	onSelect: () => void
}) {
	return (
		<button
			type="button"
			aria-pressed={selected}
			disabled={disabled || ruledOut}
			onClick={onSelect}
			className={button({ selected })}
		>
			{label}
		</button>
	)
}
