import type { ReactNode } from "react"
import { css } from "styled-system/css"

export function LegalList({ children }: { children: ReactNode }) {
	return (
		<ul
			className={css({
				fontSize: "sm",
				lineHeight: "relaxed",
				color: "fg.body",
				listStyleType: "disc",
				paddingLeft: "5",
				display: "flex",
				flexDirection: "column",
				gap: "2",
			})}
		>
			{children}
		</ul>
	)
}
