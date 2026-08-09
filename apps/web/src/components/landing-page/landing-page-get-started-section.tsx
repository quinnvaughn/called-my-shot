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
			<Button variant="solid" size="lg">
				Get started free
			</Button>
		</LandingPageContentSection>
	)
}
