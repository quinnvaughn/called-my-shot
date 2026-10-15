import type { ReactNode } from "react"
import { css } from "styled-system/css"

// The closing line several panels end on, explaining what the shape does and
// doesn't ask the creator to configure.
export function PanelNote({ children }: { children: ReactNode }) {
	return (
		<p className={css({ fontSize: "xs", color: "fg.subtle" })}>{children}</p>
	)
}
