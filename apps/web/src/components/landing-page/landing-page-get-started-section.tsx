import { HStack } from "styled-system/jsx"
import { AuthModal } from "#/components/auth/auth-modal"
import { openModal } from "#/stores/modal-store"
import { Button } from "../ui/button"
import { LandingPageContentSection } from "./landing-page-content-section"
import { StartGroupModal } from "./start-group-modal"

// Both ways in, side by side: start a group, or make an account and play on
// your own.
export function LandingPageGetStartedSection() {
	return (
		<LandingPageContentSection
			alt
			center
			eyebrow="Get started"
			title="Play with your group or on your own."
			description="Free, no money in it. Your calls and arcade streaks count either way."
		>
			<HStack gap="4" flexWrap="wrap" justify="center">
				<Button
					variant="solid"
					size="lg"
					onClick={() => openModal(<StartGroupModal surface="landing_final" />)}
				>
					Start a group
				</Button>
				<Button
					variant="outline"
					size="lg"
					onClick={() => openModal(<AuthModal defaultView="signup" />)}
				>
					Sign up
				</Button>
			</HStack>
		</LandingPageContentSection>
	)
}
