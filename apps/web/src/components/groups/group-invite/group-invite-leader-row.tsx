import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Avatar } from "#/components/ui/avatar"
import type { GroupPreviewLeader } from "./types"

export function GroupInviteLeaderRow({
	leader,
}: {
	leader: GroupPreviewLeader
}) {
	return (
		<HStack gap="3" className={css({ paddingBlock: "2" })}>
			<span
				className={css({ textStyle: "metaLg", color: "fg.subtle", width: "5" })}
			>
				{leader.rank}
			</span>
			<Avatar name={leader.name} src={leader.avatarUrl} size="sm" />
			<VStack gap="0" alignItems="flex-start" flex="1" minWidth="0">
				<span className={css({ fontSize: "sm", fontWeight: "medium" })}>
					{leader.name}
				</span>
				<span className={css({ textStyle: "meta", color: "fg.subtle" })}>
					@{leader.username}
				</span>
			</VStack>
			<span className={css({ fontFamily: "heading", fontSize: "sm" })}>
				{leader.points.toLocaleString()}
			</span>
		</HStack>
	)
}
