import type { ReactNode } from "react"
import { css } from "styled-system/css"

export function P({ children }: { children: ReactNode }) {
	return (
		<p
			className={css({
				fontSize: "sm",
				lineHeight: "relaxed",
				color: "fg.body",
			})}
		>
			{children}
		</p>
	)
}
