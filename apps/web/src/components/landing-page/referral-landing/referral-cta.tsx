import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { AuthModal } from "#/components/auth/auth-modal"
import { Button } from "#/components/ui/button"
import { openModal } from "#/stores/modal-store"

// Below lg the page is taller than a phone screen, so the button sticks to
// the bottom of the viewport until the page scrolls down to where it sits.
// The backdrop is a pseudo-element so it can run edge to edge while the
// button keeps the column's width.
export function ReferralCta() {
	return (
		<VStack
			alignItems="stretch"
			gap="3"
			className={css({
				gridArea: "cta",
				position: "sticky",
				bottom: "0",
				zIndex: 10,
				paddingTop: "4",
				paddingBottom: "calc({spacing.4} + env(safe-area-inset-bottom))",
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
				lg: {
					position: "static",
					alignSelf: "start",
					paddingBlock: "0",
					_before: { display: "none" },
				},
			})}
		>
			<Button
				variant="solid"
				size="lg"
				fullWidth
				onClick={() => openModal(<AuthModal defaultView="signup" />)}
			>
				Claim your redo
			</Button>
			<p
				className={css({
					color: "fg.subtle",
					textStyle: "metaLg",
					textAlign: "center",
				})}
			>
				free · no money, ever · takes 30 seconds
			</p>
		</VStack>
	)
}
