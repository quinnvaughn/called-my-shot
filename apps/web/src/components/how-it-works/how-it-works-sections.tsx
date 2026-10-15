import { useLocation } from "@tanstack/react-router"
import { VStack } from "styled-system/jsx"
import { BasicsSection } from "./basics-section"
import { ChallengesSection } from "./challenges-section"
import { ContrarianTiersSection } from "./contrarian-tiers-section"
import { ConvictionSection } from "./conviction-section"
import { LeaderboardSection } from "./leaderboard-section"
import { NumbersSection } from "./numbers-section"
import { NumericGuessSection } from "./numeric-guess-section"
import { PointsMathSection } from "./points-math-section"
import { PostGamePressersSection } from "./post-game-pressers-section"
import { QuestionTypesSection } from "./question-types-section"
import { RedosSection } from "./redos-section"
import { ResolutionSection } from "./resolution-section"
import { SeasonAwardSection } from "./season-award-section"
import { SeasonLongCallsSection } from "./season-long-calls-section"

export function HowItWorksSections() {
	// Lets a link elsewhere (e.g. "how resolution works" on a question's own
	// page) arrive here with the relevant section already open, not just
	// scrolled to - a closed accordion header at the top of the viewport
	// isn't actually an answer to whatever the link promised.
	const { hash } = useLocation()

	return (
		<VStack alignItems="stretch" gap="3">
			<BasicsSection />
			<NumbersSection />
			<QuestionTypesSection />
			<ConvictionSection />
			<ContrarianTiersSection />
			<PointsMathSection />
			<NumericGuessSection />
			<SeasonAwardSection />
			<SeasonLongCallsSection />
			<ResolutionSection defaultOpen={hash === "resolution"} />
			<RedosSection defaultOpen={hash === "redos"} />
			<PostGamePressersSection defaultOpen={hash === "pressers"} />
			<ChallengesSection defaultOpen={hash === "challenges"} />
			<LeaderboardSection />
		</VStack>
	)
}
