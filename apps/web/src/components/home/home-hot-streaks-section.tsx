import { useSuspenseQuery } from "@tanstack/react-query"
import { VStack } from "styled-system/jsx"
import { StreaksSection } from "#/components/profile/streaks-section"
import { homeDashboardQuery } from "#/graphql/home/queries"
import { HomeSectionLabel } from "./home-section-label"

// Same cap as the profile's top row of live runs.
const MAX_LIVE_STREAKS = 3

// Live runs only. A run that has ended, or a cold one, gives the viewer
// nothing to act on from here; both stay on the profile.
export function HomeHotStreaksSection() {
	const { data } = useSuspenseQuery(homeDashboardQuery)
	const me = data.me
	const live = (me?.streaks ?? [])
		.filter((streak) => streak.currentLength > 0)
		.slice(0, MAX_LIVE_STREAKS)
	if (!me || live.length === 0) return null
	return (
		<VStack gap="3" alignItems="stretch">
			<HomeSectionLabel>Hot streaks</HomeSectionLabel>
			<StreaksSection
				username={me.username}
				streaks={live}
				isOwn
				layout="grid"
			/>
		</VStack>
	)
}
