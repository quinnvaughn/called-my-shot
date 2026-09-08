import { useQueryClient } from "@tanstack/react-query"
import { reportQuestionSchema } from "@called-my-shot/schemas"
import { useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { ChipButton } from "#/components/ui/chip-button"
import { Button } from "#/components/ui/button"
import { FormError } from "#/components/ui/form-error"
import { Modal } from "#/components/ui/modal"
import { Textarea } from "#/components/ui/textarea"
import type { VoidReason } from "#/graphql/generated/graphql"
import { useGqlMutation } from "#/graphql/hooks"
import { ReportQuestionDocument } from "#/graphql/mutations/questions"
import { track } from "#/lib/analytics"
import { REPORT_REASON_LABELS } from "#/lib/report-defaults"
import { closeModal } from "#/stores/modal-store"

const REASON_OPTIONS: { value: VoidReason; label: string }[] = (
	Object.keys(REPORT_REASON_LABELS) as VoidReason[]
).map((value) => ({ value, label: REPORT_REASON_LABELS[value] }))

type Props = {
	questionId: string
}

export function ReportQuestionModal({ questionId }: Props) {
	const reportQuestion = useGqlMutation(ReportQuestionDocument)
	const router = useRouter()
	const queryClient = useQueryClient()
	const [reason, setReason] = useState<VoidReason | null>(null)
	const [details, setDetails] = useState("")
	const [submitting, setSubmitting] = useState(false)
	const [formError, setFormError] = useState<string | null>(null)
	const [fieldError, setFieldError] = useState<string | null>(null)

	async function handleSubmit() {
		setFormError(null)
		setFieldError(null)

		if (!reason) {
			setFieldError("Pick a reason before submitting.")
			return
		}

		const parsed = reportQuestionSchema.safeParse({
			questionId,
			reason: reason.toLowerCase(),
			details,
		})
		if (!parsed.success) {
			setFieldError(
				parsed.error.issues[0]?.message ?? "Check the form and try again.",
			)
			return
		}

		setSubmitting(true)
		try {
			const data = await reportQuestion.mutateAsync({
					input: { questionId, reason, details: details || undefined },
				})
			const result = data?.reportQuestion
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
				.with({ __typename: "AuthenticationError" }, async (r) => {
					setFormError(r.message)
				})
				.with({ __typename: "NotFoundError" }, async (r) => {
					setFormError(r.message)
				})
				.with({ __typename: "ReportQuestionPayload" }, async () => {
					track("question_reported", { questionId, reason })
					await queryClient.invalidateQueries()
					await router.invalidate()
					closeModal()
				})
				.exhaustive()
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<Modal size="md">
			<Modal.CloseButton />
			<Modal.Title>Report this question</Modal.Title>
			<VStack gap="4" alignItems="stretch">
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
						What's wrong
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
					<Textarea.Label>Details (optional)</Textarea.Label>
					<Textarea.Field
						placeholder="Anything else worth knowing?"
						maxLength={500}
						value={details}
						onChange={(e) => setDetails(e.target.value)}
					/>
					<Textarea.CharCount value={details} max={500} />
				</Textarea>

				<FormError message={formError ?? fieldError} />
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
					Submit report
				</Button>
			</HStack>
		</Modal>
	)
}
