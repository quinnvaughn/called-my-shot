import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"

type Props = {
	label: string
	fieldPct: number | null
	selected: boolean
	onClick: () => void
	disabled?: boolean
}

// A question's own option pool, rendered as a full-width selectable row with
// a live fieldPct fill bar - the pool is fixed to this question's existing
// questionOptions, not an open catalog, so unlike SubjectPicker/
// EntitySearchField this needs no search, just a pick. ChipButton (used
// elsewhere for quick-pick pills) doesn't have room for a trailing
// percentage or a fill bar, hence a dedicated component here.
export function OptionRow({
	label,
	fieldPct,
	selected,
	onClick,
	disabled,
}: Props) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className={css({
				position: "relative",
				width: "full",
				textAlign: "left",
				background: "card",
				border: "1px solid",
				borderColor: selected ? "primary.default" : "border.default",
				borderRadius: "md",
				padding: "3",
				overflow: "hidden",
				cursor: disabled ? "not-allowed" : "pointer",
				opacity: disabled ? 0.5 : 1,
				_hover: disabled ? {} : { borderColor: "border.emphasized" },
			})}
		>
			{fieldPct !== null && (
				<div
					className={css({
						position: "absolute",
						inset: "0",
						background: "bg.subtle",
						zIndex: 0,
					})}
					style={{ width: `${fieldPct}%` }}
				/>
			)}
			<HStack
				justify="space-between"
				className={css({ position: "relative", zIndex: 1 })}
			>
				<span className={css({ fontSize: "sm", fontWeight: "medium" })}>
					{label}
				</span>
				<span
					className={css({
						fontFamily: "mono",
						fontSize: "xs",
						color: selected ? "primary.default" : "fg.muted",
					})}
				>
					{fieldPct !== null ? `${Math.round(fieldPct)}%` : "—"}
				</span>
			</HStack>
		</button>
	)
}
