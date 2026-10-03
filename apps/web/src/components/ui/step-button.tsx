import type { ReactNode } from "react"
import { css } from "styled-system/css"

// A small square prev/next button for stepping through a set: a card rail's
// pages, a calendar's spans. Pass the chevron as children.
export function StepButton({
	label,
	disabled,
	onClick,
	children,
}: {
	label: string
	disabled: boolean
	onClick: () => void
	children: ReactNode
}) {
	return (
		<button
			type="button"
			aria-label={label}
			disabled={disabled}
			onClick={onClick}
			className={css({
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				width: "7",
				height: "7",
				borderRadius: "md",
				border: "1px solid {colors.border.default}",
				color: "fg.default",
				bg: "transparent",
				cursor: "pointer",
				transition: "color 0.15s ease, border-color 0.15s ease",
				_hover: { borderColor: "border.emphasized" },
				_disabled: {
					color: "fg.subtle",
					opacity: 0.4,
					cursor: "default",
					_hover: { borderColor: "border.default" },
				},
			})}
		>
			{children}
		</button>
	)
}
