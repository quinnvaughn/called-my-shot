import { type FormEvent, type ReactNode, useState } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { FormError } from "#/components/ui/form-error"
import { Modal } from "#/components/ui/modal"
import { TextInput } from "#/components/ui/text-input"

const CONFIRM_WORD = "DELETE"

type Props = {
	title: string
	// What goes and what stays.
	description: ReactNode
	// Any further confirmation, like a password, between the description and
	// the typed word.
	children?: ReactNode
	confirmLabel: string
	submitting: boolean
	// False while a field in children still needs filling in.
	canSubmit?: boolean
	error: string | null
	onSubmit: (e: FormEvent<HTMLFormElement>) => void
}

// For what can't be undone: the button stays disabled until DELETE is typed
// out, so a stray click can't get there.
export function ConfirmByTypingModal({
	title,
	description,
	children,
	confirmLabel,
	submitting,
	canSubmit = true,
	error,
	onSubmit,
}: Props) {
	const [confirmText, setConfirmText] = useState("")

	return (
		<Modal size="sm">
			<Modal.CloseButton />
			<Modal.Title className={css({ color: "danger.default" })}>
				{title}
			</Modal.Title>
			<form
				onSubmit={(e) => {
					e.preventDefault()
					onSubmit(e)
				}}
			>
				<VStack gap="3.5" alignItems="stretch">
					<Modal.Description>{description}</Modal.Description>
					{children}
					<TextInput>
						<TextInput.Label>Type {CONFIRM_WORD} to confirm</TextInput.Label>
						<TextInput.Group>
							<TextInput.Field
								placeholder={CONFIRM_WORD}
								autoComplete="off"
								value={confirmText}
								onChange={(e) => setConfirmText(e.target.value)}
							/>
						</TextInput.Group>
					</TextInput>
					<VStack gap="2" alignItems="stretch">
						<Button
							type="submit"
							variant="danger"
							size="md"
							fullWidth
							loading={submitting}
							disabled={
								submitting || !canSubmit || confirmText !== CONFIRM_WORD
							}
						>
							{confirmLabel}
						</Button>
						<FormError message={error} />
					</VStack>
				</VStack>
			</form>
		</Modal>
	)
}
