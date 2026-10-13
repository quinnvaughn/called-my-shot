import {
	PRESSER_REPORT_DETAILS_MAX,
	PRESSER_REPORT_REASON_LABELS,
	PRESSER_REPORT_REASONS,
	type PresserReportReason,
} from "@called-my-shot/schemas"
import { useState } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { ChipButton } from "#/components/ui/chip-button"
import { FormError } from "#/components/ui/form-error"
import { Modal } from "#/components/ui/modal"
import { Textarea } from "#/components/ui/textarea"
import { closeModal } from "#/stores/modal-store"

type Props = {
	title: string
	// Sends the report. Resolves to an error message, or null once it's in.
	submit: (input: {
		reason: PresserReportReason
		details: string
	}) => Promise<string | null>
}

// The reason chips and optional details every report asks for, whatever is
// being reported. Closes itself once the report goes through.
export function ReportContentModal({ title, submit }: Props) {
	const [reason, setReason] = useState<PresserReportReason | null>(null)
	const [details, setDetails] = useState("")
	const [error, setError] = useState<string | null>(null)
	const [pending, setPending] = useState(false)

	async function handleSubmit() {
		setError(null)
		if (!reason) {
			setError("Pick a reason before submitting.")
			return
		}
		setPending(true)
		try {
			const failure = await submit({ reason, details })
			if (failure) setError(failure)
			else closeModal()
		} catch {
			setError("Something went wrong. Try again.")
		} finally {
			setPending(false)
		}
	}

	return (
		<Modal size="md">
			<Modal.CloseButton />
			<Modal.Title>{title}</Modal.Title>
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
						maxLength={PRESSER_REPORT_DETAILS_MAX}
						value={details}
						onChange={(e) => setDetails(e.target.value)}
					/>
					<Textarea.CharCount
						value={details}
						max={PRESSER_REPORT_DETAILS_MAX}
					/>
				</Textarea>
				<FormError message={error} />
			</VStack>
			<HStack justify="flex-end" gap="3">
				<Button variant="ghost" onClick={closeModal}>
					Cancel
				</Button>
				<Button
					variant="solid"
					loading={pending}
					disabled={pending}
					onClick={handleSubmit}
				>
					Submit report
				</Button>
			</HStack>
		</Modal>
	)
}
