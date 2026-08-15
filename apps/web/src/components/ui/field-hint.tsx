import type { HTMLAttributes } from "react"
import { css, cx } from "styled-system/css"

// Same visual treatment as TextInput/Textarea's built-in `description` slot,
// but standalone - for fields that aren't a TextInput/Textarea (Select,
// chip pickers, custom rows) but still need a short explanation underneath.
export function FieldHint({
	className,
	...props
}: HTMLAttributes<HTMLParagraphElement>) {
	return (
		<p
			className={cx(
				css({ fontSize: "xs", color: "fg.muted", lineHeight: "relaxed" }),
				className,
			)}
			{...props}
		/>
	)
}
