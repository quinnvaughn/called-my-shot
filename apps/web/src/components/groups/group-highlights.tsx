import { useSuspenseQuery } from "@tanstack/react-query"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { EmptyState } from "#/components/ui/empty-state"
import { graphql } from "#/graphql/generated"
import { gqlQueryOptions } from "#/graphql/query-options"
import { openModal } from "#/stores/modal-store"
import { ColdStreakRows } from "./cold-streak-rows"
import { useStreakEntries, useSweepEntries } from "./group-highlight-entries"
import { GroupHighlightsSheet } from "./group-highlights-sheet"
import { HighlightList } from "./highlight-list"
import { HotStreakRows } from "./hot-streak-rows"
import { StreakRecordRows } from "./streak-record-rows"
import { SweepRows } from "./sweep-rows"

// Three of each list. The sheet behind "see all" queries the full fifty on
// its own, so nobody pays for those until they open it.
const GroupHighlightsBandDocument = graphql(`
	query GroupHighlightsBand($groupId: ID!) {
		group(id: $groupId) {
			id
			hotStreaks(limit: 3) {
				...GroupHighlights_streak
			}
			coldStreaks(limit: 3) {
				...GroupHighlights_streak
			}
			streakRecords(limit: 3) {
				...GroupHighlights_streak
			}
			recentSweeps(limit: 3) {
				...GroupHighlights_sweep
			}
		}
	}
`)

export const groupHighlightsQuery = (groupId: string) =>
	gqlQueryOptions(GroupHighlightsBandDocument, { groupId })

// Who's hot, who's cold and who just swept, under the group's Leaderboard
// tab. Deliberately outside the leaderboard's league and season filters: a
// streak has no season at all, so following them would filter the sweeps and
// leave the streaks alone. Every row carries its own league tag instead.
//
// Each list is capped at three; "see all" opens the sheet. Renders nothing
// for a group nobody has settled a call in yet, rather than three empty boxes
// under the board.
export function GroupHighlights({ groupId }: { groupId: string }) {
	const { data } = useSuspenseQuery(groupHighlightsQuery(groupId))
	const group = data.group
	const hotStreaks = useStreakEntries(group?.hotStreaks ?? [])
	const coldStreaks = useStreakEntries(group?.coldStreaks ?? [])
	const streakRecords = useStreakEntries(group?.streakRecords ?? [])
	const recentSweeps = useSweepEntries(group?.recentSweeps ?? [])

	if (
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

	return (
		<VStack alignItems="stretch" gap="3">
			<h2
				className={css({
					textStyle: "sectionHeading",
					color: "fg.muted",
				})}
			>
				Highlights
			</h2>
			<VStack alignItems="stretch" gap="5">
				<HighlightList
					label={live ? "Hot streaks" : "Best streaks"}
					onSeeAll={live ? seeAll("hot") : undefined}
				>
					{live ? (
						<HotStreakRows entries={hotStreaks} />
					) : streakRecords.length > 0 ? (
						<StreakRecordRows entries={streakRecords} />
					) : (
						<EmptyState>Nobody's put a run together yet.</EmptyState>
					)}
				</HighlightList>
				<HighlightList
					label="Cold streaks"
					onSeeAll={coldStreaks.length > 0 ? seeAll("cold") : undefined}
				>
					{coldStreaks.length > 0 ? (
						<ColdStreakRows entries={coldStreaks} />
					) : (
						<EmptyState>Nobody's cold right now.</EmptyState>
					)}
				</HighlightList>
				<HighlightList
					label="Latest sweeps"
					onSeeAll={recentSweeps.length > 0 ? seeAll("sweeps") : undefined}
				>
					{recentSweeps.length > 0 ? (
						<SweepRows entries={recentSweeps} />
					) : (
						<EmptyState>No sweeps yet.</EmptyState>
					)}
				</HighlightList>
			</VStack>
		</VStack>
	)
}
