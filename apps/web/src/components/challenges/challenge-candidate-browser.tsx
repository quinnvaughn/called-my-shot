import { useState } from "react"
import { VStack } from "styled-system/jsx"
import { Accordion } from "#/components/ui/accordion"
import { EmptyState } from "#/components/ui/empty-state"
import { TextInput } from "#/components/ui/text-input"
import { groupCandidates } from "#/lib/challenge"
import { formatShortDate } from "#/lib/format-date"
import {
	type Candidate,
	ChallengeCandidateRow,
} from "./challenge-candidate-row"

// The viewer's open questions, searchable and grouped by game. `openGameId`
// and `openQuestionId` start the group they belong to open.
export function ChallengeCandidateBrowser({
	candidates,
	picked,
	openGameId,
	openQuestionId,
	onToggle,
}: {
	candidates: Candidate[]
	picked: string[]
	openGameId: string | undefined
	openQuestionId: string | undefined
	onToggle: (id: string, on: boolean) => void
}) {
	const [query, setQuery] = useState("")
	const needle = query.trim().toLowerCase()
	const searching = needle.length > 0
	const visibleGroups = groupCandidates(
		searching
			? candidates.filter((q) => q.title.toLowerCase().includes(needle))
			: candidates,
	)

	return (
		<VStack gap="3" alignItems="stretch">
			<TextInput>
				<TextInput.Group>
					<TextInput.Field
						type="search"
						placeholder="Search your open questions"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
					/>
				</TextInput.Group>
			</TextInput>
			{visibleGroups.length === 0 && (
				<EmptyState>No open questions match that.</EmptyState>
			)}
			{visibleGroups.map((group) => {
				const pickedHere = group.questions.filter((q) =>
					picked.includes(q.id),
				).length
				return (
					<Accordion
						// Remounts on a search so every match opens.
						key={`${group.key}:${searching}`}
						title={group.title}
						subtitle={[
							group.startsAt ? formatShortDate(group.startsAt) : null,
							`${group.questions.length} open`,
							pickedHere > 0 ? `${pickedHere} picked` : null,
						]
							.filter(Boolean)
							.join(" · ")}
						defaultOpen={
							searching ||
							group.gameId === openGameId ||
							group.questions.some((q) => q.id === openQuestionId)
						}
					>
						<VStack gap="4" alignItems="stretch">
							{group.questions.map((q) => (
								<ChallengeCandidateRow
									key={q.id}
									question={q}
									checked={picked.includes(q.id)}
									onChange={(on) => onToggle(q.id, on)}
								/>
							))}
						</VStack>
					</Accordion>
				)
			})}
		</VStack>
	)
}
