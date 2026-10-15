import type { ReactNode } from "react"
import { css } from "styled-system/css"

export function Sub({ children }: { children: ReactNode }) {
	return (
		<span className={css({ fontSize: "sm", color: "fg.muted" })}>
			{children}
		</span>
	)
}
