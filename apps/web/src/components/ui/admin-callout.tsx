import type { ReactNode } from "react"
import { css } from "styled-system/css"

// Boxed note in an admin modal spelling out what the action does to
// existing data.
export function AdminCallout({ children }: { children: ReactNode }) {
	return (
		<p
			className={css({
				fontSize: "xs",
				lineHeight: "1.55",
				color: "fg.subtle",
				bg: "bg.canvas",
				border: "1px solid {colors.border.default}",
				borderRadius: "lg",
				padding: "3",
			})}
		>
			{children}
		</p>
	)
}
