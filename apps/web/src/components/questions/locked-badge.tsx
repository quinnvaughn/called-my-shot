import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { LiveDot } from "#/components/ui/live-dot"

// Not final, awaiting an answer - distinct from the live OPEN countdown
// (this doesn't tick) and from RESOLVED (which has one). Shared by
// QuestionCard and CallCard's right-side status slot.
export function LockedBadge() {
	return (
		<HStack
			gap="1.5"
			alignItems="center"
			className={css({
				textStyle: "label",
				fontWeight: "bold",
				color: "fg.subtle",
				backgroundColor: "bg.subtle",
				padding: "{spacing.1} {spacing.2}",
				borderRadius: "sm",
				whiteSpace: "nowrap",
			})}
		>
			<LiveDot tone="current" />
			Locked
		</HStack>
	)
}
