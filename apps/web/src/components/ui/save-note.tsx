import { css } from "styled-system/css"

// A quiet, non-error confirmation ("Saved", "Updated") next to a save button -
// distinct from FormError, which is always styled as a failure.
export function SaveNote({ children }: { children: string | null }) {
	if (!children) return null
	return (
		<span
			className={css({
				fontFamily: "mono",
				fontSize: "3xs",
				color: "fg.muted",
			})}
		>
			{children}
		</span>
	)
}
