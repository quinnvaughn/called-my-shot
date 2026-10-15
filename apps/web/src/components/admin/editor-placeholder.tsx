import { css } from "styled-system/css"

export function EditorPlaceholder() {
	return (
		<div
			className={css({
				minHeight: "80",
				borderRadius: "lg",
				border: "1px solid {colors.border.default}",
				bg: "bg.surface",
			})}
		/>
	)
}
