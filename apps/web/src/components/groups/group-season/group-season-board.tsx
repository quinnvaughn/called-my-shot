import { useSuspenseQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { EmptyState } from "#/components/ui/empty-state"
import { SectionLabel } from "#/components/ui/section-label"
import { groupSeasonBoardQuery } from "#/graphql/season-puzzles/queries"
import { useMe } from "#/hooks/use-me"
import { GroupSeasonMemberRow } from "./group-season-member-row"
import { GroupSeasonWeekRow } from "./group-season-week-row"

// The group's Daily tab: today's Name That Season, member by member, and the
// week so far. A first guess is worth 6 points, a sixth is worth 1, a miss
// nothing.
export function GroupSeasonBoard({ groupId }: { groupId: string }) {
	const me = useMe()
	const { data } = useSuspenseQuery(groupSeasonBoardQuery(groupId))
	const board = data.group?.seasonPuzzleBoard
	if (!board) {
		return (
			<EmptyState>Only the group's members can see its scoreboard.</EmptyState>
		)
	}
	const viewer = board.today.find((r) => r.user.id === me?.id)
	const viewerDone = viewer?.status === "SOLVED" || viewer?.status === "MISSED"

	return (
		<VStack gap="8" alignItems="stretch">
			<VStack gap="3" alignItems="stretch">
				<div
					className={css({
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						gap: "3",
					})}
				>
					<SectionLabel>Today's Name That Season</SectionLabel>
					{!viewerDone && (
						<Link
							to="/play/name-that-season"
							className={button({ variant: "solid", size: "sm" })}
						>
							Play today's
						</Link>
					)}
				</div>
				<Card>
					{board.today.map((row) => (
						<GroupSeasonMemberRow key={row.user.id} row={row} />
					))}
				</Card>
			</VStack>
			<VStack gap="3" alignItems="stretch">
				<SectionLabel>This week</SectionLabel>
				<p className={css({ fontSize: "sm", color: "fg.muted" })}>
					Weeks run Tuesday through Monday. A first guess is worth 6 points, a
					sixth guess 1, and a miss nothing.
				</p>
				<Card>
					{board.week.map((row, i) => (
						<GroupSeasonWeekRow key={row.user.id} rank={i + 1} row={row} />
					))}
				</Card>
			</VStack>
		</VStack>
	)
}
