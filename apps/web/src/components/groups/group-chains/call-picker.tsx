import { VStack } from "styled-system/jsx"
import { EmptyState } from "#/components/ui/empty-state"
import type { ChainLinkCandidate_CandidateFragment } from "#/graphql/generated/graphql"
import { EligibleCallRow } from "./eligible-call-row"

type Props = {
	candidates: ChainLinkCandidate_CandidateFragment[]
	selectedCallId: string | null
	onSelect: (callId: string) => void
}

// The viewer's open calls, the ones that can be a link first.
export function CallPicker({ candidates, selectedCallId, onSelect }: Props) {
	const sorted = [...candidates].sort(
		(a, b) => Number(a.reason !== null) - Number(b.reason !== null),
	)
	if (sorted.length === 0) {
		return (
			<EmptyState>
				You don't have any open calls. Make a call on a game, then come back.
			</EmptyState>
		)
	}
	return (
		<VStack gap="2" alignItems="stretch" maxHeight="96" overflowY="auto">
			{sorted.map((candidate) =>
				candidate.call ? (
					<EligibleCallRow
						key={candidate.call.id}
						candidate={candidate}
						selected={candidate.call.id === selectedCallId}
						onSelect={() => candidate.call && onSelect(candidate.call.id)}
					/>
				) : null,
			)}
		</VStack>
	)
}
