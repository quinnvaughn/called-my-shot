import type { ButtonHTMLAttributes } from "react"
import { css, cx } from "styled-system/css"
import { type ButtonVariantProps, button } from "styled-system/recipes"

// Re-exported so non-<button> elements (Link, a) can pick up the same styling:
// className={button({ variant: "ghost" })}
export { type ButtonVariantProps, button }

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
	ButtonVariantProps & {
		loading?: boolean
	}

export function Button({
	variant,
	size,
	fullWidth,
	loading,
	disabled,
	className,
	children,
	...props
}: ButtonProps) {
	return (
		<button
			type="button"
			disabled={disabled || loading}
			className={cx(button({ variant, size, fullWidth }), className)}
			{...props}
		>
			{loading && (
				<span
					aria-hidden
					className={css({
						width: "3.5",
						height: "3.5",
						borderRadius: "full",
						border: "2px solid",
						borderColor: "color-mix(in srgb, currentColor 30%, transparent)",
						borderTopColor: "currentColor",
						animation: "spin 0.7s linear infinite",
					})}
				/>
			)}
			{children}
		</button>
	)
}
