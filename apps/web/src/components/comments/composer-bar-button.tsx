import { forwardRef, type ReactNode } from "react"
import { css } from "styled-system/css"

type Props = {
	label: string
	onClick: () => void
	disabled?: boolean
	// Lit when pressing it does something now: a message ready to send, the
	// picker open.
	active?: boolean
	children: ReactNode
}

// A borderless icon inside the message bar.
export const ComposerBarButton = forwardRef<HTMLButtonElement, Props>(
	function ComposerBarButton(
		{ label, onClick, disabled = false, active = false, children },
		ref,
	) {
	return (
		<button
			ref={ref}
			type="button"
			aria-label={label}
			title={label}
			disabled={disabled}
			onClick={onClick}
			className={css({
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				flexShrink: 0,
				width: "9",
				height: "9",
				borderRadius: "md",
				color: active ? "primary.default" : "fg.muted",
				cursor: disabled ? "default" : "pointer",
				opacity: disabled ? 0.4 : 1,
				transition: "color 0.15s ease, background-color 0.15s ease",
				_hover: disabled ? {} : { color: "fg.default", bg: "bg.surface" },
			})}
		>
			{children}
		</button>
	)
	},
)
