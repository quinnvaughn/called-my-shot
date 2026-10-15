import type { ReactNode } from "react"
import { css, cx } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { LiveDot } from "#/components/ui/live-dot"
import type { RecordTone } from "#/lib/record-tag"

// Panda reads token classes statically, so each tone is its own literal
// css() call rather than a lookup inside one.
const recordTagClassByTone: Record<RecordTone, string> = {
	pending: css({
		backgroundColor: "secondary.subtle",
		color: "secondary.default",
	}),
	live: css({
		backgroundColor: "secondary.subtle",
		color: "secondary.default",
	}),
	success: css({
		backgroundColor: "success.subtle",
		color: "success.default",
	}),
	danger: css({
		backgroundColor: "danger.subtle",
		color: "danger.default",
	}),
	neutral: css({
		backgroundColor: "border.default",
		color: "fg.default",
	}),
}

const recordTagBaseClass = css({
	flexShrink: "0",
	textStyle: "label",
	fontWeight: "bold",
	borderRadius: "sm",
	paddingBlock: "1",
	paddingInline: "2",
	whiteSpace: "nowrap",
})

// Where something stands, small in the corner: blue while it's still out
// there, green or red once it settles. The live tone's pulsing dot marks a
// state still waiting on something.
export function RecordTag({
	tone,
	children,
}: {
	tone: RecordTone
	children: ReactNode
}) {
	if (tone === "live") {
		return (
			<HStack
				gap="1.5"
				className={cx(recordTagBaseClass, recordTagClassByTone[tone])}
			>
				<LiveDot tone="current" />
				<span>{children}</span>
			</HStack>
		)
	}
	return (
		<span className={cx(recordTagBaseClass, recordTagClassByTone[tone])}>
			{children}
		</span>
	)
}
