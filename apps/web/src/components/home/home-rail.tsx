import { VStack } from "styled-system/jsx"
import { useMe } from "#/hooks/use-me"
import { HomeHotStreaksSection } from "./home-hot-streaks-section"
import { HomeJustResolvedSection } from "./home-just-resolved-section"
import { HomeResultsSection } from "./home-results-section"

// All of it is the viewer's own, so a signed-out Home has no rail.
export function HomeRail() {
	const me = useMe()
	if (!me) return null
	return (
		<VStack gap="8" alignItems="stretch">
			<HomeResultsSection placement="rail" />
			<HomeHotStreaksSection />
			<HomeJustResolvedSection />
		</VStack>
	)
}
