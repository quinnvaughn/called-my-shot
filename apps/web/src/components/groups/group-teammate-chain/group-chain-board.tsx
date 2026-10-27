import { useSuspenseQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { SectionLabel } from "#/components/ui/section-label"
import { groupTeammateChainBoardQuery } from "#/graphql/teammate-chain/queries"
import { useMe } from "#/hooks/use-me"
import { GroupChainMemberRow } from "./group-chain-member-row"

// Today's Teammate Chain in the group's Arcade tab, member by member: fewest
// links first, then fewest misses, then fastest.
export function GroupChainBoard({ groupId }: { groupId: string }) {
	const me = useMe()
	const { data } = useSuspenseQuery(groupTeammateChainBoardQuery(groupId))
	const board = data.group?.teammateChainBoard
	if (!board) return null
	const viewerStatus = board.today.find((r) => r.user.id === me?.id)?.status
	const viewerDone = viewerStatus === "SOLVED" || viewerStatus === "GAVE_UP"

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
				<SectionLabel>
					Today's Teammate Chain{board.par ? ` · par ${board.par}` : ""}
				</SectionLabel>
				{!viewerDone && (
					<Link
						to="/arcade/teammate-chain"
						className={button({ variant: "solid", size: "sm" })}
					>
						Play today's
					</Link>
				)}
			</div>
			<Card>
				{board.today.map((row) => (
					<GroupChainMemberRow key={row.user.id} row={row} />
				))}
			</Card>
		</VStack>
	)
}
