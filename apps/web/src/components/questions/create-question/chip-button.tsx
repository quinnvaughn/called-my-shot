import type { ReactNode } from "react"
import { css, cx } from "styled-system/css"

type Props = {
	selected?: boolean
	onClick: () => void
	children: ReactNode
}

// Shared by the stat picker, subject picker, and resolution-source
// suggestions - a small quick-pick pill that either toggles a value
// (selected state) or just fills a field (no selected state needed).
export function ChipButton({ selected, onClick, children }: Props) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cx(
				css({
					fontFamily: "mono",
					fontSize: "2xs",
					letterSpacing: "wide",
					color: "fg.subtle",
					border: "1px solid",
					borderColor: "border.default",
					borderRadius: "md",
					padding: "{spacing.1.5} {spacing.2.5}",
					_hover: {
						borderColor: "border.emphasized",
						color: "fg.body",
						cursor: "pointer",
					},
				}),
				selected &&
					css({
						color: "fg.default",
						borderColor: "primary.default",
						bg: "primary.subtle",
						_hover: {
							color: "fg.default",
							borderColor: "primary.default",
							bg: "primary.subtle",
							cursor: "pointer",
						},
					}),
			)}
		>
			{children}
		</button>
	)
}
