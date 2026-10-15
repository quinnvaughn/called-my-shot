import { useQueryClient } from "@tanstack/react-query"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { Card } from "#/components/ui/card"
import { FieldLabel } from "#/components/ui/field-label"
import {
	invalidateBallots,
	RemoveQuestionFromBallotDocument,
	ReorderBallotQuestionsDocument,
	UpdateBallotQuestionDocument,
} from "#/graphql/ballots/mutations"
import { useGqlMutation } from "#/graphql/hooks"
import { MemberRow } from "./member-row"
import type { AdminBallot } from "./types"

export function AdminBallotMembers({
	ballotId,
	ballot,
}: {
	ballotId: string
	ballot: AdminBallot
}) {
	const queryClient = useQueryClient()
	const updateBallotQuestion = useGqlMutation(UpdateBallotQuestionDocument)
	const removeQuestionFromBallot = useGqlMutation(
		RemoveQuestionFromBallotDocument,
	)
	const reorderBallotQuestions = useGqlMutation(ReorderBallotQuestionsDocument)

	const members = [...ballot.members].sort((a, b) => a.sortOrder - b.sortOrder)

	async function move(index: number, direction: "up" | "down") {
		const target = direction === "up" ? index - 1 : index + 1
		if (target < 0 || target >= members.length) return
		const reordered = [...members]
		;[reordered[index], reordered[target]] = [
			reordered[target],
			reordered[index],
		]
		await reorderBallotQuestions.mutateAsync({
			ballotId,
			orderedQuestionIds: reordered.map((m) => m.question.id),
		})
		await invalidateBallots(queryClient)
	}

	async function saveMember(
		questionId: string,
		label: string,
		slot: string,
		section: string,
	) {
		if (!label.trim()) return
		await updateBallotQuestion.mutateAsync({
			input: {
				questionId,
				label,
				slot: slot || undefined,
				section: section || undefined,
			},
		})
	}

	async function removeMember(questionId: string, title: string) {
		if (
			!window.confirm(
				`Remove "${title}" from this ballot? The question itself stays.`,
			)
		) {
			return
		}
		await removeQuestionFromBallot.mutateAsync({ questionId })
		await invalidateBallots(queryClient)
	}

	return (
		<VStack gap="3" alignItems="stretch">
			<FieldLabel>Members ({members.length})</FieldLabel>
			{members.length === 0 && (
				<Card>
					<Card.Body>
						<p className={css({ fontSize: "sm", color: "fg.subtle" })}>
							No questions yet.
						</p>
					</Card.Body>
				</Card>
			)}
			{members.map((member, i) => (
				<MemberRow
					key={member.id}
					member={member}
					position={i}
					total={members.length}
					onMove={(direction) => move(i, direction)}
					onSave={(label, slot, section) =>
						saveMember(member.question.id, label, slot, section)
					}
					onRemove={() =>
						removeMember(member.question.id, member.question.title)
					}
				/>
			))}
		</VStack>
	)
}
