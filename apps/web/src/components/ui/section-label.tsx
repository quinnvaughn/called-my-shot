import type { ReactNode } from "react"
import { css } from "styled-system/css"

export function SectionLabel({ children }: { children: ReactNode }) {
	return (
		<h2
			className={css({
				textStyle: "sectionHeading",
				color: "fg.muted",
			})}
		>
			{children}
		</h2>
	)
}
