import { css } from "styled-system/css"

export function SupportEmail() {
	return (
		<a
			href="mailto:support@calledmyshot.com"
			className={css({ color: "fg.default", textDecoration: "underline" })}
		>
			support@calledmyshot.com
		</a>
	)
}
