import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"

// Not final, awaiting an answer - distinct from the live OPEN countdown
// (this doesn't tick) and from RESOLVED (which has one). Shared by
// QuestionCard and CallCard's right-side status slot.
export function LockedBadge() {
	return (
		<HStack
			gap="1.5"
			alignItems="center"
			className={css({
				fontFamily: "mono",
				fontSize: "2xs",
				fontWeight: "bold",
				letterSpacing: "wide",
				textTransform: "uppercase",
				color: "fg.subtle",
				backgroundColor: "bg.subtle",
				padding: "{spacing.1} {spacing.2}",
				borderRadius: "sm",
				whiteSpace: "nowrap",
			})}
		>
			<span
				className={css({
					width: "1.5",
					height: "1.5",
					borderRadius: "full",
					backgroundColor: "currentColor",
					animation: "pulse 1.6s ease-in-out infinite",
				})}
			/>
			Locked
		</HStack>
	)
}
