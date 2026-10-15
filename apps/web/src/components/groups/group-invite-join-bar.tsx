import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"

type Props = {
	groupName: string
	onJoin: () => void
	joining: boolean
	freeNote: ReactNode
}

// Below lg, sticks to the bottom of the viewport over a backdrop that runs
// edge to edge while the button keeps the column's width. It has to stay
// last in the page to stay pinned the whole way down: a sticky element lets
// go once the page scrolls past where it sits. Same bar as /join/$code.
export function GroupInviteJoinBar({
	groupName,
	onJoin,
	joining,
	freeNote,
}: Props) {
	return (
		<VStack
			alignItems="stretch"
			gap="2"
			className={css({
				width: "full",
				maxWidth: "md",
				alignSelf: "center",
				position: "sticky",
				bottom: "0",
				zIndex: 10,
				paddingTop: "3",
				paddingBottom: "calc({spacing.3} + env(safe-area-inset-bottom))",
				// Pulls the bar down over <main>'s bottom padding (5 below
				// xl), so at the end of the page it rests flush with the
				// viewport the same way it sits while pinned.
				marginBottom: "-5",
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
				},
				lg: { display: "none" },
			})}
		>
			<Button
				variant="solid"
				size="md"
				fullWidth
				onClick={onJoin}
				loading={joining}
			>
				Join {groupName}
			</Button>
			{freeNote}
		</VStack>
	)
}
