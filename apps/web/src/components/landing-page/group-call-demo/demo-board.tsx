import { VStack } from "styled-system/jsx"
import { Eyebrow } from "#/components/ui/eyebrow"
import { DemoBoardRow } from "./demo-board-row"
import type { DemoBoardEntry } from "./demo-fixture"

// The top of the group's board once the demo's game is final.
export function DemoBoard({ board }: { board: DemoBoardEntry[] }) {
	return (
		<VStack gap="2" alignItems="stretch">
			<Eyebrow variant="neutral" size="sm">
				Group leaderboard
			</Eyebrow>
			<VStack gap="0.5" alignItems="stretch">
				{board.map((entry, index) => (
					<DemoBoardRow key={entry.name} rank={index + 1} entry={entry} />
				))}
			</VStack>
		</VStack>
	)
}
