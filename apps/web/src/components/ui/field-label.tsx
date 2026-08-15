import type { ReactNode } from "react"
import { css, cx } from "styled-system/css"
import { RequiredMark } from "./required-mark"

const labelStyle = css({
	fontFamily: "mono",
	fontSize: "2xs",
	letterSpacing: "wide",
	color: "fg.subtle",
	textTransform: "uppercase",
})

type Props = {
	required?: boolean
	className?: string
	children: ReactNode
}

// A standalone label for fields that aren't a TextInput/Textarea and so
// don't have an htmlFor'd <label> to attach to (Select, and the custom
// pickers below it) - same visual treatment as TextInput.Label, plus the
// same required-marking.
export function FieldLabel({ required, className, children }: Props) {
	return (
		<span className={cx(labelStyle, className)}>
			{children}
			{required && <RequiredMark />}
		</span>
	)
}
