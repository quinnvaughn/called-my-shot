import { voidQuestionSchema } from "@called-my-shot/schemas"
import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { AdminCallout } from "#/components/ui/admin-callout"
import { Button } from "#/components/ui/button"
import { ChipButton } from "#/components/ui/chip-button"
import { FormError } from "#/components/ui/form-error"
import { Modal } from "#/components/ui/modal"
import { TextInput } from "#/components/ui/text-input"
import { Textarea } from "#/components/ui/textarea"
import { ToggleRow } from "#/components/ui/toggle-row"
import {
	invalidateAdminQueue,
	VoidQuestionDocument,
} from "#/graphql/admin/queue/mutations"
import { ApiError } from "#/graphql/api-error"
import type { VoidReason } from "#/graphql/generated/graphql"
import { useGqlMutation } from "#/graphql/hooks"
import {
	defaultCountsAsStrike,
	VOID_REASON_LABELS,
} from "#/lib/admin/void-defaults"
import { closeModal } from "#/stores/modal-store"

const REASON_OPTIONS: { value: VoidReason; label: string }[] = (
	Object.keys(VOID_REASON_LABELS) as VoidReason[]
).map((value) => ({ value, label: VOID_REASON_LABELS[value] }))

const reasonToSchemaValue = {
	NONSENSICAL: "nonsensical",
	OFF_TOPIC: "off_topic",
	UNSUPPORTED_SPORT: "unsupported_sport",
	DUPLICATE: "duplicate",
	OTHER: "other",
} as const

type Props = {
	question: { id: string; title: string; creator: { username: string } | null }
}

export function VoidQuestionModal({ question }: Props) {
	const queryClient = useQueryClient()
	const voidQuestion = useGqlMutation(VoidQuestionDocument)
	const [reason, setReason] = useState<VoidReason>("NONSENSICAL")
	const [duplicateOfQuestionId, setDuplicateOfQuestionId] = useState("")
	const [note, setNote] = useState("")
	const [countsAsStrike, setCountsAsStrike] = useState(
		defaultCountsAsStrike("NONSENSICAL"),
	)
	const [strikeTouched, setStrikeTouched] = useState(false)
	const [submitting, setSubmitting] = useState(false)
	const [formError, setFormError] = useState<string | null>(null)
	const [fieldError, setFieldError] = useState<string | null>(null)

	function selectReason(next: VoidReason) {
		setReason(next)
		if (!strikeTouched) setCountsAsStrike(defaultCountsAsStrike(next))
	}

	async function handleVoid() {
		setFormError(null)
		setFieldError(null)

		const parsed = voidQuestionSchema.safeParse({
			questionId: question.id,
			reason: reasonToSchemaValue[reason],
			duplicateOfQuestionId: duplicateOfQuestionId || undefined,
			note,
			countsAsStrike,
		})
		if (!parsed.success) {
			setFieldError(
				parsed.error.issues[0]?.message ?? "Check the form and try again.",
			)
			return
		}

		setSubmitting(true)
		try {
			const data = await voidQuestion.mutateAsync({
				input: {
					questionId: question.id,
					reason,
					duplicateOfQuestionId: duplicateOfQuestionId || undefined,
					note: note || undefined,
					countsAsStrike,
				},
			})
			const result = data?.voidQuestion
			if (!result) {
				setFormError("Something went wrong. Try again.")
				return
			}
			await match(result)
				.with({ __typename: "ValidationError" }, async (r) => {
					setFieldError(
						r.fieldErrors?.[0]?.message ?? "Check the form and try again.",
					)
				})
				.with(ApiError, async (r) => {
					setFormError(r.message)
				})
				.with({ __typename: "VoidQuestionPayload" }, async () => {
					closeModal()
					invalidateAdminQueue(queryClient)
				})
				.exhaustive()
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<Modal size="md">
			<Modal.CloseButton />
			<Modal.Title>Void question</Modal.Title>
			<VStack gap="4" alignItems="stretch">
				<VStack
					gap="1"
					alignItems="flex-start"
					className={css({
						bg: "bg.canvas",
						border: "1px solid {colors.border.default}",
						borderRadius: "lg",
						padding: "3",
					})}
				>
					<span className={css({ fontSize: "sm", fontWeight: "medium" })}>
						{question.title}
					</span>
					<span
						className={css({
							textStyle: "meta",
							color: "fg.subtle",
						})}
					>
						asked by{" "}
						{question.creator
							? `@${question.creator.username}`
							: "deleted user"}
					</span>
				</VStack>

				<VStack gap="2" alignItems="stretch">
					<span
						className={css({
							textStyle: "label",
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
								onClick={() => selectReason(option.value)}
							>
								{option.label}
							</ChipButton>
						))}
					</HStack>
				</VStack>

				{reason === "DUPLICATE" && (
					<TextInput>
						<TextInput.Label required>Duplicate of</TextInput.Label>
						<TextInput.Group>
							<TextInput.Field
								placeholder="Paste the original question's ID"
								value={duplicateOfQuestionId}
								onChange={(e) => setDuplicateOfQuestionId(e.target.value)}
							/>
						</TextInput.Group>
					</TextInput>
				)}

				<Textarea>
					<Textarea.Label>Internal note (optional)</Textarea.Label>
					<Textarea.Field
						placeholder="Not shown to the user"
						maxLength={500}
						value={note}
						onChange={(e) => setNote(e.target.value)}
					/>
				</Textarea>

				<ToggleRow
					label="Count against asker's strikes"
					description={
						defaultCountsAsStrike(reason)
							? "This reason counts against strikes by default: toggle off if it shouldn't this time."
							: "This reason doesn't count by default: toggle on if it should this time."
					}
					checked={countsAsStrike}
					onChange={(next) => {
						setStrikeTouched(true)
						setCountsAsStrike(next)
					}}
				/>

				<AdminCallout>
					Deletes the question and every call made on it. No points move:
					nothing's committed until resolution, so there's nothing to reverse.
					Can't be undone.
				</AdminCallout>

				<FormError message={formError ?? fieldError} />
			</VStack>
			<HStack justify="flex-end" gap="3">
				<Button variant="ghost" onClick={closeModal}>
					Cancel
				</Button>
				<Button
					variant="danger"
					loading={submitting}
					disabled={submitting}
					onClick={handleVoid}
				>
					Void question
				</Button>
			</HStack>
		</Modal>
	)
}
