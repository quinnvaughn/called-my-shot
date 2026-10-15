import { VStack } from "styled-system/jsx"
import { HomeHotStreaksSection } from "./home-hot-streaks-section"
import { HomeJustResolvedSection } from "./home-just-resolved-section"
import { HomeResultsSection } from "./home-results-section"

export function HomeRail() {
	return (
		<VStack gap="8" alignItems="stretch">
			<HomeResultsSection placement="rail" />
			<HomeHotStreaksSection />
			<HomeJustResolvedSection />
		</VStack>
	)
}
