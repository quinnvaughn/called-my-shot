import { useSuspenseQuery } from "@tanstack/react-query"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { Card } from "#/components/ui/card"
import { SectionLabel } from "#/components/ui/section-label"
import { groupArcadeWeekQuery } from "#/graphql/arcade/queries"
import { GroupArcadeWeekRow } from "./group-arcade-week-row"

// The week so far across every arcade game, most points first.
export function GroupArcadeWeek({ groupId }: { groupId: string }) {
	const { data } = useSuspenseQuery(groupArcadeWeekQuery(groupId))
	const week = data.group?.arcadeWeek
	if (!week) return null
	return (
		<VStack gap="3" alignItems="stretch">
			<SectionLabel>This week</SectionLabel>
			<p className={css({ fontSize: "sm", color: "fg.muted" })}>
				Weeks run Tuesday through Monday. Name That Season is worth 6 points for
				a first guess down to 1 for a sixth, and nothing for a miss. Blind Rank
				is worth a point for each of the five in the right slot. Teammate Chain
				is worth 6 points at par, 1 less for each link over it and each hint
				(never below 1), and nothing if you give up.
			</p>
			<Card>
				{week.map((row, i) => (
					<GroupArcadeWeekRow key={row.user.id} rank={i + 1} row={row} />
				))}
			</Card>
		</VStack>
	)
}
