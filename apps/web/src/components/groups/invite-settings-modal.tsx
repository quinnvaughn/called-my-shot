import { useMutation } from "@apollo/client/react"
import { useState } from "react"
import { css, cx } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { InviteCodeModal } from "#/components/groups/invite-code-modal"
import type { InviteExpiry } from "#/graphql/generated/graphql"
import { ResetGroupInviteCodeDocument } from "#/graphql/generated/graphql"
import { closeModal, replaceModalStack } from "#/stores/modal-store"
import { Button } from "../ui/button"
import { FormError } from "../ui/form-error"
import { Modal } from "../ui/modal"

type Props = {
	groupName: string
	inviteId: string
	expirationDate: string | null
}

const EXPIRY_OPTIONS: { value: InviteExpiry; label: string }[] = [
	{ value: "TWENTY_FOUR_HOURS", label: "24 hours" },
	{ value: "SEVEN_DAYS", label: "7 days" },
	{ value: "NO_EXPIRY", label: "Never" },
]

// There's no stored record of which of the three options produced the
// current expiresAt, only the resulting timestamp - null maps cleanly to
// "no expiry", anything else defaults to the app-wide default (7 days)
// rather than trying to reverse-guess the original bucket.
function defaultExpiry(expirationDate: string | null): InviteExpiry {
	return expirationDate === null ? "NO_EXPIRY" : "SEVEN_DAYS"
}

export function InviteSettingsModal({
	groupName,
	inviteId,
	expirationDate,
}: Props) {
	const [expiry, setExpiry] = useState<InviteExpiry>(
		defaultExpiry(expirationDate),
	)
	const [resetInviteCode, { loading }] = useMutation(
		ResetGroupInviteCodeDocument,
	)
	const [error, setError] = useState<string | null>(null)

	async function handleGenerate() {
		setError(null)
		const { data } = await resetInviteCode({ variables: { inviteId, expiry } })
		const result = data?.resetGroupInviteCode

		if (result?.__typename === "GroupInvite") {
			replaceModalStack(
				<InviteCodeModal
					groupName={groupName}
					inviteId={result.id}
					inviteCode={result.code}
					expirationDate={result.expiresAt}
				/>,
			)
			return
		}
		setError(result?.message ?? "Something went wrong. Try again.")
	}

	return (
		<Modal size="md">
			<Modal.CloseButton />
			<Modal.Title>Invite link settings</Modal.Title>
			<VStack gap="4" alignItems="stretch">
				<VStack gap="2" alignItems="stretch">
					<span
						className={css({
							fontFamily: "mono",
							fontSize: "xs",
							letterSpacing: "wide",
							color: "fg.muted",
						})}
					>
						EXPIRE AFTER
					</span>
					<div className={css({ display: "flex", gap: "2" })}>
						{EXPIRY_OPTIONS.map((option) => (
							<button
								key={option.value}
								type="button"
								onClick={() => setExpiry(option.value)}
								className={cx(
									css({
										flex: 1,
										fontFamily: "mono",
										fontSize: "xs",
										textAlign: "center",
										padding: "2.5",
										borderRadius: "md",
										border: "1px solid",
										cursor: "pointer",
									}),
									css(
										expiry === option.value
											? {
													backgroundColor: "fg.default",
													color: "bg.canvas",
													borderColor: "fg.default",
												}
											: {
													backgroundColor: "transparent",
													color: "fg.muted",
													borderColor: "border.emphasized",
												},
									),
								)}
							>
								{option.label}
							</button>
						))}
					</div>
				</VStack>
				<Button
					variant="solid"
					size="md"
					fullWidth
					loading={loading}
					disabled={loading}
					onClick={handleGenerate}
				>
					Generate a New Link
				</Button>
				<FormError message={error} />
				<button
					type="button"
					onClick={closeModal}
					className={css({
						fontFamily: "mono",
						fontSize: "xs",
						color: "fg.muted",
						textAlign: "center",
						cursor: "pointer",
						_hover: { color: "fg.default" },
					})}
				>
					Cancel
				</button>
			</VStack>
		</Modal>
	)
}
