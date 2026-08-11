import { css } from "styled-system/css"

export function FormError({ message }: { message: string | null }) {
	if (!message) return null
	return (
		<p
			role="alert"
			className={css({
				fontSize: "xs",
				color: "danger.default",
				textAlign: "center",
			})}
		>
			{message}
		</p>
	)
}
