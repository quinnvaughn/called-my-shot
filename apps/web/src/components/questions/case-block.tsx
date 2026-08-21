import { useLayoutEffect, useRef, useState } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"

type Props = {
	text: string
	// "The case" (a caller's own reasoning) is the default and by far the
	// most common use - resolution notes reuse the same labeled-block
	// treatment with a different label rather than a separate component.
	label?: string
	// A caller's case can run long - CallCard/CallRow opt into a 3-line clamp
	// with a toggle rather than letting a wall of text dominate the card.
	// Resolution notes (the other use of this component) are admin-written
	// captions, short enough that clamping would never trigger - left off by
	// default so that use is unaffected.
	clampable?: boolean
}

// Plain labeled block, set off from whatever's above it by a top rule - not
// a quoted callout (no icon, no background, no side border). The rule
// itself needs its own padding-top (room between the line and the eyebrow
// text below it), but spacing before this block comes from the containing
// VStack's gap, not a margin here.
export function CaseBlock({ text, label = "The case", clampable }: Props) {
	const [expanded, setExpanded] = useState(false)
	const [overflowing, setOverflowing] = useState(false)
	const textRef = useRef<HTMLSpanElement>(null)
	const clamped = clampable && !expanded

	// Only worth a toggle if the text actually overflows 3 lines at its
	// rendered width - a short case (see the pending-call reference example)
	// gets no button at all rather than a dead one that never does anything.
	useLayoutEffect(() => {
		if (!clampable || !textRef.current) return
		setOverflowing(textRef.current.scrollHeight > textRef.current.clientHeight)
	}, [clampable])

	return (
		<VStack
			gap="1.5"
			alignItems="stretch"
			className={css({
				paddingTop: "3",
				borderTop: "1px solid {colors.border.default}",
			})}
		>
			<span
				className={css({
					fontFamily: "mono",
					fontSize: "4xs",
					letterSpacing: "wide",
					textTransform: "uppercase",
					color: "fg.subtle",
				})}
			>
				{label}
			</span>
			<span
				ref={textRef}
				className={css({
					fontSize: "sm",
					color: "fg.body",
					lineHeight: "relaxed",
					lineClamp: clamped ? 3 : "none",
				})}
			>
				{text}
			</span>
			{clampable && overflowing && (
				<button
					type="button"
					onClick={() => setExpanded((v) => !v)}
					className={css({
						fontFamily: "mono",
						fontSize: "2xs",
						color: "primary.default",
						background: "none",
						border: "none",
						cursor: "pointer",
						padding: "0",
						alignSelf: "flex-start",
					})}
				>
					{expanded ? "Show less" : "Show more"}
				</button>
			)}
		</VStack>
	)
}
