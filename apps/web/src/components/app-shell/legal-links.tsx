import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"

const linkClass = css({ _hover: { color: "fg.default" } })

// Under the social links in the side column and the More sheet. Google's
// sign-in review checks that the homepage links to the privacy policy, and
// Home is the homepage.
export function LegalLinks({ onNavigate }: { onNavigate?: () => void }) {
	return (
		<HStack
			gap="3"
			flexWrap="wrap"
			paddingInline="2"
			className={css({ textStyle: "metaLg", color: "fg.subtle" })}
		>
			<Link to="/how-it-works" onClick={onNavigate} className={linkClass}>
				How It Works
			</Link>
			<Link to="/privacy" onClick={onNavigate} className={linkClass}>
				Privacy
			</Link>
			<Link to="/terms" onClick={onNavigate} className={linkClass}>
				Terms
			</Link>
		</HStack>
	)
}
