import type { ReactNode } from "react"
import { css } from "styled-system/css"

export const iconButtonClass = css({
	display: "inline-flex",
	alignItems: "center",
	justifyContent: "center",
	width: { base: "11", sm: "9" },
	height: { base: "11", sm: "9" },
	borderRadius: "md",
	border: "1px solid {colors.border.default}",
	color: "fg.default",
	cursor: "pointer",
	transition: "background-color 0.15s ease",
	_hover: { backgroundColor: "bg.subtle" },
})

export function IconButton({
	label,
	onClick,
	children,
}: {
	label: string
	onClick: () => void
	children: ReactNode
}) {
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			onClick={onClick}
			className={iconButtonClass}
		>
			{children}
		</button>
	)
}
