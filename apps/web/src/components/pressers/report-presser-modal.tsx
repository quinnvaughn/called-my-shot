import {
	PRESSER_REPORT_REASON_LABELS,
	PRESSER_REPORT_REASONS,
	type PresserReportReason,
	reportPresserContentSchema,
} from "@called-my-shot/schemas"
import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { Button } from "#/components/ui/button"
import { ChipButton } from "#/components/ui/chip-button"
import { FormError } from "#/components/ui/form-error"
import { Modal } from "#/components/ui/modal"
import { Textarea } from "#/components/ui/textarea"
import type {
	PresserReportReason as PresserReportReasonEnum,
	PresserReportTarget,
} from "#/graphql/generated/graphql"
import { useGqlMutation } from "#/graphql/hooks"
import { ReportPresserContentDocument } from "#/graphql/mutations/pressers"
import { closeModal } from "#/stores/modal-store"

type Props = {
	presserId: string
	presserQuestionId: string | null
	target: PresserReportTarget
}

const TITLES: Record<PresserReportTarget, string> = {
	QUESTION: "Report this question",
	ANSWER: "Report this answer",
	STATEMENT: "Report this statement",
}

export function ReportPresserModal({
	presserId,
	presserQuestionId,
	target,
}: Props) {
	const report = useGqlMutation(ReportPresserContentDocument)
	const queryClient = useQueryClient()
	const [reason, setReason] = useState<PresserReportReason | null>(null)
	const [details, setDetails] = useState("")
	const [error, setError] = useState<string | null>(null)

	async function handleSubmit() {
		setError(null)
		if (!reason) {
			setError("Pick a reason before submitting.")
			return
		}
		const parsed = reportPresserContentSchema.safeParse({
			presserId,
			presserQuestionId,
			target: target.toLowerCase(),
			reason,
			details,
		})
		if (!parsed.success) {
			setError(
				parsed.error.issues[0]?.message ?? "Check the form and try again.",
			)
			return
		}
		const data = await report.mutateAsync({
			input: {
				presserId,
				presserQuestionId,
				target,
				reason: reason.toUpperCase() as PresserReportReasonEnum,
				details: details || undefined,
			},
		})
		const result = data?.reportPresserContent
		if (!result) {
			setError("Something went wrong. Try again.")
			return
		}
		await match(result)
			.with({ __typename: "PresserReportPayload" }, async () => {
				await queryClient.invalidateQueries()
				closeModal()
			})
			.with({ __typename: "ValidationError" }, async (r) => {
				setError(r.fieldErrors[0]?.message ?? r.message)
			})
			.with(
				{ __typename: "AuthenticationError" },
				{ __typename: "NotFoundError" },
				async (r) => setError(r.message),
			)
			.exhaustive()
	}

	return (
		<Modal size="md">
			<Modal.CloseButton />
			<Modal.Title>{TITLES[target]}</Modal.Title>
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
						{PRESSER_REPORT_REASONS.map((value) => (
							<ChipButton
								key={value}
								selected={reason === value}
								onClick={() => setReason(value)}
							>
								{PRESSER_REPORT_REASON_LABELS[value]}
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
				<FormError message={error} />
			</VStack>
			<HStack justify="flex-end" gap="3">
				<Button variant="ghost" onClick={closeModal}>
					Cancel
				</Button>
				<Button
					variant="solid"
					loading={report.isPending}
					disabled={report.isPending}
					onClick={handleSubmit}
				>
					Submit report
				</Button>
			</HStack>
		</Modal>
	)
}
