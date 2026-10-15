import { useState } from "react"
import { VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { EmptyState } from "#/components/ui/empty-state"
import { SectionHeading } from "./section-heading"
import type { Week } from "./types"
import { WeekRow } from "./week-row"

// Enough to see the last couple of months without scrolling past the
// records.
const WEEKS_SHOWN = 8

export function PlayerOfTheWeekHistory({ weeks }: { weeks: Week[] }) {
	const [showAll, setShowAll] = useState(false)
	const shown = showAll ? weeks : weeks.slice(0, WEEKS_SHOWN)

	return (
		<VStack alignItems="stretch" gap="3">
			<SectionHeading>Player of the Week</SectionHeading>
			{weeks.length === 0 ? (
				<EmptyState>
					The first Player of the Week is named in the group's first weekly
					recap.
				</EmptyState>
			) : (
				<VStack alignItems="stretch" gap="2">
					{shown.map((week) => (
						<WeekRow key={week.weekKey} week={week} />
					))}
					{!showAll && weeks.length > WEEKS_SHOWN && (
						<Button
							variant="outline"
							size="sm"
							onClick={() => setShowAll(true)}
						>
							Show all {weeks.length} weeks →
						</Button>
					)}
				</VStack>
			)}
		</VStack>
	)
}
