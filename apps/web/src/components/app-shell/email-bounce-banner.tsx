import { Link } from "@tanstack/react-router"
import { FiAlertTriangle } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"

// Shown site-wide, not dismissible. Every email we send this person is
// currently going nowhere, and the only thing that fixes it is them changing
// the address - a banner they can wave away would let the account go on
// silently missing every result email indefinitely.
//
// Deliberately not tied to emailVerified: this only appears once mail we
// actually sent came back permanently (see lib/email-bounce.ts on the api).
export function EmailBounceBanner() {
	return (
		<HStack
			gap="3"
			alignItems="center"
			justify="center"
			className={css({
				width: "full",
				padding: "3",
				backgroundColor: "danger.subtle",
				border: "1px solid {colors.danger.default}",
				borderRadius: "lg",
				flexWrap: "wrap",
			})}
		>
			<FiAlertTriangle
				size={16}
				className={css({ color: "danger.default", flexShrink: 0 })}
			/>
			<span className={css({ fontSize: "sm", color: "fg.default" })}>
				Your email is bouncing. We can't reach you. Results and account email
				won't arrive until you update it.
			</span>
			<Link
				to="/settings"
				className={css({
					textStyle: "sectionHeading",
					color: "danger.default",
					textDecoration: "underline",
				})}
			>
				Fix it
			</Link>
		</HStack>
	)
}
