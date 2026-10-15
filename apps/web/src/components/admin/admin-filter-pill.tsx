import type { ReactNode } from "react"
import { css, cx } from "styled-system/css"

type Props = {
	active: boolean
	onClick: () => void
	children: ReactNode
}

// Status filter above the admin tables. The active pill is filled with ink.
export function AdminFilterPill({ active, onClick, children }: Props) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cx(
				css({
					textStyle: "label",
					padding: "{spacing.1.5} {spacing.3}",
					borderRadius: "lg",
					border: "1px solid {colors.border.default}",
					color: "fg.subtle",
					cursor: "pointer",
					_hover: {
						border: "1px solid {colors.border.emphasized}",
						color: "fg.default",
					},
				}),
				active &&
					css({
						border: "1px solid {colors.fg.default}",
						color: "bg.canvas",
						bg: "fg.default",
						_hover: {
							border: "1px solid {colors.fg.default}",
							color: "bg.canvas",
						},
					}),
			)}
		>
			{children}
		</button>
	)
}
