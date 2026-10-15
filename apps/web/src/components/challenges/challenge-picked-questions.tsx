import { VStack } from "styled-system/jsx"
import { Card } from "#/components/ui/card"
import { EmptyState } from "#/components/ui/empty-state"
import { Eyebrow } from "#/components/ui/eyebrow"
import { pluralize } from "#/lib/pluralize"
import {
	type Candidate,
	ChallengeCandidateRow,
} from "./challenge-candidate-row"

export function ChallengePickedQuestions({
	pickedCount,
	questions,
	onToggle,
}: {
	pickedCount: number
	questions: Candidate[]
	onToggle: (id: string, on: boolean) => void
}) {
	return (
		<Card size="md">
			<Card.Header>
				<Eyebrow variant="neutral">
					{`${pickedCount} ${pluralize(pickedCount, "question")} picked`}
				</Eyebrow>
			</Card.Header>
			<Card.Body>
				{questions.length === 0 ? (
					<EmptyState>Pick questions from your games below.</EmptyState>
				) : (
					<VStack gap="4" alignItems="stretch">
						{questions.map((q) => (
							<ChallengeCandidateRow
								key={q.id}
								question={q}
								checked
								onChange={(on) => onToggle(q.id, on)}
							/>
						))}
					</VStack>
				)}
			</Card.Body>
		</Card>
	)
}
