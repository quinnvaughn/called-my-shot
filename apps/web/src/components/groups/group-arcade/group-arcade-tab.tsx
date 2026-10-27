import { VStack } from "styled-system/jsx"
import { GroupRankBoard } from "#/components/groups/group-rank/group-rank-board"
import { GroupSeasonBoard } from "#/components/groups/group-season/group-season-board"
import { GroupChainBoard } from "#/components/groups/group-teammate-chain/group-chain-board"
import { GroupArcadeWeek } from "./group-arcade-week"

// The group's Arcade tab: each arcade game's board for today, then the week
// across all of them.
export function GroupArcadeTab({ groupId }: { groupId: string }) {
	return (
		<VStack gap="8" alignItems="stretch">
			<GroupSeasonBoard groupId={groupId} />
			<GroupRankBoard groupId={groupId} />
			<GroupChainBoard groupId={groupId} />
			<GroupArcadeWeek groupId={groupId} />
		</VStack>
	)
}
