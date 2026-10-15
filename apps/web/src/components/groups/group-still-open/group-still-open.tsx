import { useSuspenseQuery } from "@tanstack/react-query"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { openModal } from "#/stores/modal-store"
import { groupStillOpenQuery } from "./still-open-query"
import { StillOpenRow } from "./still-open-row"
import { StillOpenSheet } from "./still-open-sheet"

// As many as the rail takes before the week race below it drops out of view.
const STILL_OPEN_ROWS = 4

type Props = {
	groupId: string
	// The rail shows from xl; the band is its stand-in below that.
	placement: "rail" | "band"
}

// Questions about to lock that the group has called and the viewer hasn't,
// with where the group landed on each. Renders nothing when none qualify.
export function GroupStillOpen({ groupId, placement }: Props) {
	const { data } = useSuspenseQuery(groupStillOpenQuery(groupId))
	const entries = data.group?.stillOpenQuestions ?? []
	if (entries.length === 0) return null

	return (
		<VStack
			alignItems="stretch"
			gap="2"
			display={placement === "band" ? { base: "flex", xl: "none" } : "flex"}
		>
			<HStack justify="space-between" alignItems="baseline" gap="3">
				<h2 className={css({ textStyle: "sectionHeading", color: "fg.muted" })}>
					Still open
				</h2>
				{entries.length > STILL_OPEN_ROWS && (
					<button
						type="button"
						onClick={() => openModal(<StillOpenSheet groupId={groupId} />)}
						className={css({
							flexShrink: "0",
							textStyle: "label",
							color: "fg.subtle",
							cursor: "pointer",
							_hover: { color: "fg.default" },
						})}
					>
						See all {entries.length} →
					</button>
				)}
			</HStack>
			<VStack alignItems="stretch" gap="1">
				{entries.slice(0, STILL_OPEN_ROWS).map((entry) => (
					<StillOpenRow key={entry.question.id} entry={entry} />
				))}
			</VStack>
		</VStack>
	)
}
