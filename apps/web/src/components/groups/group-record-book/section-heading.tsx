import { css } from "styled-system/css"

export function SectionHeading({ children }: { children: string }) {
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
