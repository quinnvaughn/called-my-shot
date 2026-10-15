import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { EmptyState } from "#/components/ui/empty-state"
import type { FragmentType } from "#/graphql/generated"
import { openModal } from "#/stores/modal-store"
import { ColdStreakRows } from "./cold-streak-rows"
import {
	type GroupStreakEntryFragment,
	type GroupSweepEntryFragment,
	useStreakEntries,
	useSweepEntries,
} from "./group-highlight-entries"
import { GroupHighlightsSheet } from "./group-highlights-sheet"
import { HighlightList } from "./highlight-list"
import { HotStreakRows } from "./hot-streak-rows"
import { StreakRecordRows } from "./streak-record-rows"
import { SweepRows } from "./sweep-rows"

type Props = {
	groupId: string
	hotStreaks: readonly FragmentType<typeof GroupStreakEntryFragment>[]
	coldStreaks: readonly FragmentType<typeof GroupStreakEntryFragment>[]
	streakRecords: readonly FragmentType<typeof GroupStreakEntryFragment>[]
	recentSweeps: readonly FragmentType<typeof GroupSweepEntryFragment>[]
}

// Who's hot, who's cold and who just swept. Deliberately outside the
// leaderboard's league and season filters: a streak has no season at all, so
// following them would filter the sweeps and leave the streaks alone. Every
// row carries its own league tag instead.
//
// Each list is capped at three; "see all" opens the sheet. The band renders
// nothing for a group nobody has settled a call in yet, rather than three empty
// boxes mid-page. The rail always shows its lists, so the column is never
// blank.
function Highlights({
	placement,
	...props
}: Props & { placement: "band" | "rail" }) {
	const { groupId } = props
	const hotStreaks = useStreakEntries(props.hotStreaks)
	const coldStreaks = useStreakEntries(props.coldStreaks)
	const streakRecords = useStreakEntries(props.streakRecords)
	const recentSweeps = useSweepEntries(props.recentSweeps)

	if (
		placement === "band" &&
		hotStreaks.length === 0 &&
		coldStreaks.length === 0 &&
		streakRecords.length === 0 &&
		recentSweeps.length === 0
	) {
		return null
	}

	const seeAll = (tab: "hot" | "cold" | "sweeps") => () =>
		openModal(<GroupHighlightsSheet groupId={groupId} initialTab={tab} />)
	const live = hotStreaks.length > 0
	const compact = placement === "rail"

	return (
		<VStack
			alignItems="stretch"
			gap="3"
			// The band is the below-xl stand-in for the rail, which the shell
			// only shows from xl.
			display={placement === "band" ? { base: "flex", xl: "none" } : "flex"}
		>
			<h2
				className={css({
					textStyle: "sectionHeading",
					color: "fg.muted",
				})}
			>
				Highlights
			</h2>
			<VStack alignItems="stretch" gap={compact ? "6" : "5"}>
				<HighlightList
					label={live ? "Hot streaks" : "Best streaks"}
					onSeeAll={live ? seeAll("hot") : undefined}
				>
					{live ? (
						<HotStreakRows entries={hotStreaks} compact={compact} />
					) : streakRecords.length > 0 ? (
						<StreakRecordRows entries={streakRecords} compact={compact} />
					) : (
						<EmptyState>Nobody's put a run together yet.</EmptyState>
					)}
				</HighlightList>
				<HighlightList
					label="Cold streaks"
					onSeeAll={coldStreaks.length > 0 ? seeAll("cold") : undefined}
				>
					{coldStreaks.length > 0 ? (
						<ColdStreakRows entries={coldStreaks} compact={compact} />
					) : (
						<EmptyState>Nobody's cold right now.</EmptyState>
					)}
				</HighlightList>
				<HighlightList
					label="Latest sweeps"
					onSeeAll={recentSweeps.length > 0 ? seeAll("sweeps") : undefined}
				>
					{recentSweeps.length > 0 ? (
						<SweepRows entries={recentSweeps} compact={compact} />
					) : (
						<EmptyState>No sweeps yet.</EmptyState>
					)}
				</HighlightList>
			</VStack>
		</VStack>
	)
}

// Under the group's Leaderboard tab, below xl.
export function GroupHighlights(props: Props) {
	return <Highlights {...props} placement="band" />
}

// The group page's right rail, from xl.
export function GroupHighlightsRail(props: Props) {
	return <Highlights {...props} placement="rail" />
}
