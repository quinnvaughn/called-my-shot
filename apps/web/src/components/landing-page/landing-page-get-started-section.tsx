import { Link } from "@tanstack/react-router"
import { HStack } from "styled-system/jsx"
import { AuthModal } from "#/components/auth/auth-modal"
import { openModal } from "#/stores/modal-store"
import { Button, button } from "../ui/button"
import { LandingPageContentSection } from "./landing-page-content-section"

// Sends people back up to the hero's picks first, since trying a few is the
// easier yes. Anyone who'd rather skip straight to an account still can, and
// picks already made post either way once they land on Home.
export function LandingPageGetStartedSection() {
	return (
		<LandingPageContentSection
			center
			eyebrow="Get started"
			title="Your friends already have opinions. Get yours on the record."
			description="Free, and it takes about 30 seconds."
		>
			<HStack gap="4" flexWrap="wrap" justify="center">
				<Link
					to="/"
					hash="make-calls"
					className={button({ variant: "solid", size: "lg" })}
				>
					Make your calls ↑
				</Link>
				<Button
					variant="ghost"
					size="lg"
					onClick={() => openModal(<AuthModal defaultView="signup" />)}
				>
					Just sign up
				</Button>
			</HStack>
		</LandingPageContentSection>
	)
}
