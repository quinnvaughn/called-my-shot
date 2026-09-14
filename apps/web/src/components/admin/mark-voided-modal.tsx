import { adminMarkQuestionVoidedSchema } from "@called-my-shot/schemas"
import { useState } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { Button } from "#/components/ui/button"
import { ChipButton } from "#/components/ui/chip-button"
import { FormError } from "#/components/ui/form-error"
import { Modal } from "#/components/ui/modal"
import { Textarea } from "#/components/ui/textarea"
import type { QuestionVoidedReason } from "#/graphql/generated/graphql"
import { useGqlMutation } from "#/graphql/hooks"
import { AdminMarkQuestionVoidedDocument } from "#/graphql/mutations/admin"
import { closeModal } from "#/stores/modal-store"

const REASON_OPTIONS: { value: QuestionVoidedReason; label: string }[] = [
	{ value: "SUBJECT_DID_NOT_PLAY", label: "Player didn't play" },
	{ value: "GAME_NOT_COMPLETED", label: "Game not completed" },
	{ value: "TIE", label: "Tie" },
	{ value: "NO_LEADER", label: "Nobody recorded the stat" },
	{ value: "OTHER", label: "Other" },
]

const reasonToSchemaValue = {
	SUBJECT_DID_NOT_PLAY: "subject_did_not_play",
	GAME_NOT_COMPLETED: "game_not_completed",
	TIE: "tie",
	NO_LEADER: "no_leader",
	OTHER: "other",
} as const satisfies Record<QuestionVoidedReason, string>

type Props = {
	question: { id: string; title: string }
	onVoided: () => void
}

// Settles a question with no result and keeps it - see adminMarkQuestionVoided.
// VoidQuestionModal is the other void: a moderation action that deletes the
// question and can strike its asker.
export function MarkVoidedModal({ question, onVoided }: Props) {
	const markVoided = useGqlMutation(AdminMarkQuestionVoidedDocument)
	const [reason, setReason] = useState<QuestionVoidedReason>(
		"SUBJECT_DID_NOT_PLAY",
	)
	const [note, setNote] = useState("")
	const [submitting, setSubmitting] = useState(false)
	const [formError, setFormError] = useState<string | null>(null)

	async function handleSubmit() {
		setFormError(null)

		const parsed = adminMarkQuestionVoidedSchema.safeParse({
			questionId: question.id,
			reason: reasonToSchemaValue[reason],
			note,
		})
		if (!parsed.success) {
			setFormError(
				parsed.error.issues[0]?.message ?? "Check the form and try again.",
			)
			return
		}

		setSubmitting(true)
		try {
			const data = await markVoided.mutateAsync({
				input: { questionId: question.id, reason, note: note || undefined },
			})
			const result = data?.adminMarkQuestionVoided
			if (!result) {
				setFormError("Something went wrong. Try again.")
				return
			}
			match(result)
				.with({ __typename: "ValidationError" }, (r) => {
					setFormError(
						r.fieldErrors?.[0]?.message ?? "Check the form and try again.",
					)
				})
				.with(
					{ __typename: "AuthenticationError" },
					{ __typename: "AuthorizationError" },
					{ __typename: "NotFoundError" },
					(r) => {
						setFormError(r.message)
					},
				)
				.with({ __typename: "QuestionPayload" }, () => {
					closeModal()
					onVoided()
				})
				.exhaustive()
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<Modal size="md">
			<Modal.CloseButton />
			<Modal.Title>No result</Modal.Title>
			<VStack gap="4" alignItems="stretch">
				<span
					className={css({
						fontSize: "sm",
						fontWeight: "medium",
						bg: "bg.canvas",
						border: "1px solid {colors.border.default}",
						borderRadius: "lg",
						padding: "3",
					})}
				>
					{question.title}
				</span>

				<VStack gap="2" alignItems="stretch">
					<span
						className={css({
							fontFamily: "mono",
							fontSize: "2xs",
							letterSpacing: "wide",
							textTransform: "uppercase",
							color: "fg.subtle",
						})}
					>
						Reason
					</span>
					<HStack gap="1.5" flexWrap="wrap">
						{REASON_OPTIONS.map((option) => (
							<ChipButton
								key={option.value}
								selected={reason === option.value}
								onClick={() => setReason(option.value)}
							>
								{option.label}
							</ChipButton>
						))}
					</HStack>
				</VStack>

				<Textarea>
					<Textarea.Label>Note (optional)</Textarea.Label>
					<Textarea.Field
						placeholder="Shown to callers on the question"
						maxLength={500}
						value={note}
						onChange={(e) => setNote(e.target.value)}
					/>
				</Textarea>

				<p
					className={css({
						fontSize: "xs",
						lineHeight: "1.55",
						color: "fg.subtle",
						bg: "bg.canvas",
						border: "1px solid {colors.border.default}",
						borderRadius: "lg",
						padding: "3",
					})}
				>
					Keeps the question and every call on it, but none of them score. Any
					points it already paid out come back off. Resolving it later gives it
					a result again.
				</p>

				<FormError message={formError} />
			</VStack>
			<HStack justify="flex-end" gap="3">
				<Button variant="ghost" onClick={closeModal}>
					Cancel
				</Button>
				<Button
					variant="solid"
					loading={submitting}
					disabled={submitting}
					onClick={handleSubmit}
				>
					Void with no result
				</Button>
			</HStack>
		</Modal>
	)
}
