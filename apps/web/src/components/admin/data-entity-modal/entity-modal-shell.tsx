import type { ReactNode } from "react"
import { HStack, VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { FormError } from "#/components/ui/form-error"
import { Modal } from "#/components/ui/modal"
import { closeModal } from "#/stores/modal-store"

// The shared chrome every entity form below wraps itself in - title, close
// button, error line, save/cancel footer. Each form owns its own useForm
// instance and mutation (different schema/mutation per entity type, so they
// can't share one hook call), but they all look and behave the same way.
export function EntityModalShell({
	title,
	formId,
	saving,
	canSave,
	formError,
	children,
}: {
	title: string
	formId: string
	saving: boolean
	canSave: boolean
	formError: string | null
	children: ReactNode
}) {
	return (
		<Modal size="md">
			<Modal.CloseButton />
			<Modal.Title>{title}</Modal.Title>
			<VStack gap="4" alignItems="stretch">
				{children}
				<FormError message={formError} />
			</VStack>
			<HStack justify="flex-end" gap="3">
				<Button variant="ghost" onClick={closeModal}>
					Cancel
				</Button>
				<Button
					type="submit"
					form={formId}
					variant="solid"
					loading={saving}
					disabled={saving || !canSave}
				>
					Save
				</Button>
			</HStack>
		</Modal>
	)
}
