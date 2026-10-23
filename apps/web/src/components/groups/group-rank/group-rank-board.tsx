import { useSuspenseQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { SectionLabel } from "#/components/ui/section-label"
import { groupRankBoardQuery } from "#/graphql/blind-rank/queries"
import { useMe } from "#/hooks/use-me"
import { GroupRankMemberRow } from "./group-rank-member-row"

// Today's Blind Rank in the group's Arcade tab, member by member.
export function GroupRankBoard({ groupId }: { groupId: string }) {
	const me = useMe()
	const { data } = useSuspenseQuery(groupRankBoardQuery(groupId))
	const board = data.group?.rankBoard
	if (!board) return null
	const viewerDone =
		board.today.find((r) => r.user.id === me?.id)?.status === "DONE"

	return (
		<VStack gap="3" alignItems="stretch">
			<div
				className={css({
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					gap: "3",
				})}
			>
				<SectionLabel>Today's Blind Rank</SectionLabel>
				{!viewerDone && (
					<Link
						to="/arcade/blind-rank"
						className={button({ variant: "solid", size: "sm" })}
					>
						Play today's
					</Link>
				)}
			</div>
			<Card>
				{board.today.map((row) => (
					<GroupRankMemberRow key={row.user.id} row={row} />
				))}
			</Card>
		</VStack>
	)
}
