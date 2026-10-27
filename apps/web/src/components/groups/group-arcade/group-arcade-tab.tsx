import { VStack } from "styled-system/jsx"
import { GroupRankBoard } from "#/components/groups/group-rank/group-rank-board"
import { GroupSeasonBoard } from "#/components/groups/group-season/group-season-board"
import { GroupChainBoard } from "#/components/groups/group-teammate-chain/group-chain-board"
import { GroupWatchRecent } from "#/components/groups/group-watch/group-watch-recent"
import { GroupArcadeWeek } from "./group-arcade-week"

// The group's Arcade tab: each daily game's board for today, the Were You
// Watching? quizzes members took this week, then the week across all of
// them.
export function GroupArcadeTab({ groupId }: { groupId: string }) {
	return (
		<VStack gap="8" alignItems="stretch">
			<GroupSeasonBoard groupId={groupId} />
			<GroupRankBoard groupId={groupId} />
			<GroupChainBoard groupId={groupId} />
			<GroupWatchRecent groupId={groupId} />
			<GroupArcadeWeek groupId={groupId} />
		</VStack>
	)
}
