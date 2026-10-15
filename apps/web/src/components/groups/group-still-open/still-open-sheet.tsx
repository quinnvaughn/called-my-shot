import { useQuery } from "@tanstack/react-query"
import { VStack } from "styled-system/jsx"
import { EmptyState } from "#/components/ui/empty-state"
import { Sheet } from "#/components/ui/sheet"
import { groupStillOpenQuery } from "./still-open-query"
import { StillOpenRow } from "./still-open-row"

// Every question behind the list's "see all". The same query as the list, so
// opening it costs no request.
export function StillOpenSheet({ groupId }: { groupId: string }) {
	const { data } = useQuery(groupStillOpenQuery(groupId))
	const entries = data?.group?.stillOpenQuestions ?? []

	return (
		<Sheet>
			<Sheet.Header>
				<Sheet.Title>Still open</Sheet.Title>
				<Sheet.CloseButton />
			</Sheet.Header>
			<Sheet.Body>
				{entries.length > 0 ? (
					<VStack alignItems="stretch" gap="1">
						{entries.map((entry) => (
							<StillOpenRow key={entry.question.id} entry={entry} />
						))}
					</VStack>
				) : (
					<EmptyState>Nothing the group's called is still open.</EmptyState>
				)}
			</Sheet.Body>
		</Sheet>
	)
}
