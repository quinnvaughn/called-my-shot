import type { ReactNode } from "react"
import { css } from "styled-system/css"

const prose = css({ fontSize: "sm", lineHeight: "relaxed", color: "fg.body" })

export function LegalP({ children }: { children: ReactNode }) {
	return <p className={prose}>{children}</p>
}
