import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"

type Props = {
	prompt: ReactNode
	sub: ReactNode
	action: ReactNode
	onAction: () => void
	// Pins to the bottom of the viewport below md instead of sitting in the
	// flow as a box.
	sticky?: boolean
}

const boxClass = css({
	display: "flex",
	flexDirection: { base: "column", sm: "row" },
	gap: "4",
	alignItems: { base: "stretch", sm: "center" },
	justifyContent: "space-between",
	padding: "5",
	borderRadius: "lg",
	border: "1px solid {colors.border.default}",
	background: "bg.subtle",
})

// Below md the content above fills the first screen or more, so a box under
// it is out of sight for most of the read. It sticks to the bottom of the
// viewport instead, over a backdrop that runs edge to edge, and settles back
// into place once the page scrolls down to it. From md up it's the same box
// as the unpinned one.
const stickyClass = css({
	display: "flex",
	flexDirection: { base: "column", md: "row" },
	gap: { base: "3", md: "4" },
	alignItems: { base: "stretch", md: "center" },
	justifyContent: "space-between",
	position: "sticky",
	bottom: "0",
	zIndex: 10,
	paddingTop: "3",
	paddingBottom: "calc({spacing.3} + env(safe-area-inset-bottom))",
	_before: {
		content: '""',
		position: "absolute",
		insetBlock: "0",
		left: "50%",
		width: "100vw",
		transform: "translateX(-50%)",
		zIndex: -1,
		bg: "bg.canvas/92",
		backdropFilter: "blur(10px)",
		borderTop: "1px solid {colors.border.default}",
		// Only visible once it has settled mid-page; pinned, it sits on the
		// viewport's edge.
		borderBottom: "1px solid {colors.border.default}",
	},
	md: {
		position: "static",
		padding: "5",
		borderRadius: "lg",
		border: "1px solid {colors.border.default}",
		background: "bg.subtle",
		_before: { display: "none" },
	},
})

const promptClass = css({
	fontSize: "md",
	fontWeight: "semibold",
	color: "fg.default",
})

// A size down on a phone, where the pinned bar sits over the content.
const stickyPromptClass = css({
	fontSize: { base: "sm", md: "md" },
	fontWeight: "semibold",
	color: "fg.default",
})

const subClass = css({
	fontSize: "sm",
	color: "fg.muted",
})

const stickySubClass = css({
	fontSize: { base: "xs", md: "sm" },
	color: "fg.muted",
})

// A one-line ask with a single solid button, for the one thing a page wants
// the viewer to do next.
export function PromptCta({ prompt, sub, action, onAction, sticky }: Props) {
	return (
		<div className={sticky ? stickyClass : boxClass}>
			<VStack gap="1" alignItems="flex-start">
				<span className={sticky ? stickyPromptClass : promptClass}>
					{prompt}
				</span>
				<span className={sticky ? stickySubClass : subClass}>{sub}</span>
			</VStack>
			<Button variant="solid" size="md" onClick={onAction}>
				{action}
			</Button>
		</div>
	)
}
