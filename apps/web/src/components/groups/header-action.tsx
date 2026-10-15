import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { Button, type ButtonVariantProps } from "#/components/ui/button"

// A phone can't fit a group name and several labeled buttons on one line, and
// the name is the more important half - so below md each action shows only its
// icon (plus compactLabel, when set), with the label carried as the button's
// accessible name.
export function HeaderAction({
	label,
	compactLabel,
	icon,
	variant,
	onClick,
}: {
	label: string
	compactLabel?: string
	icon: ReactNode
	variant: ButtonVariantProps["variant"]
	onClick: () => void
}) {
	return (
		<Button
			size="sm"
			variant={variant}
			aria-label={label}
			onClick={onClick}
			// Square off the horizontal padding while only the icon shows, so the
			// button doesn't read as a wide empty pill.
			className={css({
				paddingInline: { base: compactLabel ? "3" : "2.5", md: "4.5" },
			})}
		>
			<span
				className={css({
					display: { base: "flex", md: "none" },
					alignItems: "center",
					gap: "1.5",
				})}
			>
				{icon}
				{compactLabel}
			</span>
			<span className={css({ display: { base: "none", md: "inline" } })}>
				{label}
			</span>
		</Button>
	)
}
