import { VStack } from "styled-system/jsx"
import { GroupRankBoard } from "#/components/groups/group-rank/group-rank-board"
import { GroupSeasonBoard } from "#/components/groups/group-season/group-season-board"
import { GroupArcadeWeek } from "./group-arcade-week"

// The group's Arcade tab: each arcade game's board for today, then the week
// across both.
export function GroupArcadeTab({ groupId }: { groupId: string }) {
	return (
		<VStack gap="8" alignItems="stretch">
			<GroupSeasonBoard groupId={groupId} />
			<GroupRankBoard groupId={groupId} />
			<GroupArcadeWeek groupId={groupId} />
		</VStack>
	)
}
