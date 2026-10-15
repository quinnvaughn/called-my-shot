import type { ReactNode } from "react"
import { css } from "styled-system/css"

// Half-height so a pair stacks into the height of one row. A direction the
// row can't go stays as a disabled button, keeping both arrows where the eye
// expects them.
export function MoveButton({
	label,
	onClick,
	children,
}: {
	label: string
	onClick: (() => void) | null
	children: ReactNode
}) {
	return (
		<button
			type="button"
			aria-label={label}
			disabled={onClick === null}
			onClick={onClick ?? undefined}
			className={css({
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				width: "6",
				height: "4",
				borderRadius: "sm",
				border: "1px solid {colors.border.default}",
				backgroundColor: "bg.surface",
				color: "fg.default",
				fontSize: "xs",
				cursor: "pointer",
				_hover: { border: "1px solid {colors.border.emphasized}" },
				_disabled: { opacity: 0.3, cursor: "default" },
			})}
		>
			{children}
		</button>
	)
}
