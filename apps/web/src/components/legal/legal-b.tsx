import type { ReactNode } from "react"
import { css } from "styled-system/css"

export function LegalB({ children }: { children: ReactNode }) {
	return (
		<b className={css({ color: "fg.default", fontWeight: "semibold" })}>
			{children}
		</b>
	)
}
