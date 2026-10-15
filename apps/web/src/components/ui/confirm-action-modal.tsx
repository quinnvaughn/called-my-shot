import { type ReactNode, useState } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { FormError } from "#/components/ui/form-error"
import { Modal } from "#/components/ui/modal"
import { closeModal } from "#/stores/modal-store"

type Props = {
	title: string
	children: ReactNode
	confirmLabel: string
	danger?: boolean
	// Resolves to an error message to show in the modal, or null once the
	// action went through (the modal then closes itself).
	onConfirm: () => Promise<string | null>
}

export function ConfirmActionModal({
	title,
	children,
	confirmLabel,
	danger = false,
	onConfirm,
}: Props) {
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | null>(null)

	async function handleConfirm() {
		setError(null)
		setSubmitting(true)
		try {
			const message = await onConfirm()
			if (message) setError(message)
			else closeModal()
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<Modal size="sm">
			<Modal.CloseButton />
			<Modal.Title
				className={danger ? css({ color: "danger.default" }) : undefined}
			>
				{title}
			</Modal.Title>
			<VStack gap="4" alignItems="stretch">
				<Modal.Description>{children}</Modal.Description>
				<FormError message={error} />
				<HStack justify="flex-end" gap="3">
					<Button variant="ghost" onClick={closeModal}>
						Cancel
					</Button>
					<Button
						variant={danger ? "danger" : "solid"}
						loading={submitting}
						disabled={submitting}
						onClick={handleConfirm}
					>
						{confirmLabel}
					</Button>
				</HStack>
			</VStack>
		</Modal>
	)
}
