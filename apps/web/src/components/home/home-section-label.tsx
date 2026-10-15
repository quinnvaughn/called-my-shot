import type { ReactNode } from "react"
import { css } from "styled-system/css"

export function HomeSectionLabel({ children }: { children: ReactNode }) {
	return (
		<h2
			className={css({
				textStyle: "label",
				color: "fg.muted",
			})}
		>
			{children}
		</h2>
	)
}
