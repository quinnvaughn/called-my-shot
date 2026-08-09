import { AuthModal } from "#/components/auth/auth-modal"
import { openModal } from "#/stores/modal-store"
import { Button } from "../ui/button"
import { LandingPageContentSection } from "./landing-page-content-section"

export function LandingPageGetStartedSection() {
	return (
		<LandingPageContentSection
			center
			eyebrow="Get started"
			title="It's always free. Your standing is earned."
			description="Always free. The only thing on the line is your record."
		>
			<Button
				variant="solid"
				size="lg"
				onClick={() => openModal(<AuthModal defaultView="signup" />)}
			>
				Get started free
			</Button>
		</LandingPageContentSection>
	)
}
