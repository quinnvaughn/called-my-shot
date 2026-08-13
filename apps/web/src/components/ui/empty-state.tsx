import { css } from "styled-system/css"

type EmptyStateProps = {
	children: string
}

export function EmptyState({ children }: EmptyStateProps) {
	return (
		<p
			className={css({
				fontSize: "xs",
				fontFamily: "mono",
				color: "fg.muted",
				padding: "6",
				textAlign: "center",
			})}
		>
			{children}
		</p>
	)
}
