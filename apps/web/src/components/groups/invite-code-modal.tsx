import { useState } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { InviteSettingsModal } from "#/components/groups/invite-settings-modal"
import { openModal } from "#/stores/modal-store"
import { Button } from "../ui/button"
import { Modal } from "../ui/modal"
import { TextInput } from "../ui/text-input"

type Props = {
	groupName: string
	inviteId: string
	inviteCode: string
	expirationDate: string | null
}

function formatExpiry(expirationDate: string | null) {
	if (!expirationDate) return "Never expires"
	const msRemaining = new Date(expirationDate).getTime() - Date.now()
	if (msRemaining <= 0) return "Link has expired"
	const hours = Math.round(msRemaining / (1000 * 60 * 60))
	if (hours < 24) return `Expires in ${hours} hour${hours === 1 ? "" : "s"}`
	const days = Math.round(hours / 24)
	return `Expires in ${days} day${days === 1 ? "" : "s"}`
}

export function InviteCodeModal({
	groupName,
	inviteId,
	inviteCode,
	expirationDate,
}: Props) {
	const [copied, setCopied] = useState(false)
	const inviteUrl = `${window.location.origin}/groups/join/${inviteCode}`
	const displayUrl = `${window.location.host}/groups/join/${inviteCode}`

	function handleCopy() {
		navigator.clipboard.writeText(inviteUrl)
		setCopied(true)
		setTimeout(() => setCopied(false), 1200)
	}

	return (
		<Modal size="md">
			<Modal.CloseButton />
			<Modal.Title>Invite to {groupName}</Modal.Title>
			<VStack gap="2" alignItems="stretch">
				<HStack justify="space-between" gap="4">
					<TextInput className={css({ flex: 1, minWidth: 0 })}>
						<TextInput.Group>
							<TextInput.Field readOnly value={displayUrl} />
						</TextInput.Group>
					</TextInput>
					<Button variant="white" onClick={handleCopy}>
						{copied ? "Copied" : "Copy"}
					</Button>
				</HStack>
				<HStack justify="space-between" gap="4">
					<span
						className={css({
							fontFamily: "mono",
							fontSize: "xs",
							color: "fg.muted",
						})}
					>
						{formatExpiry(expirationDate)}
					</span>
					<button
						type="button"
						className={css({
							fontFamily: "mono",
							fontSize: "xs",
							color: "primary.default",
							cursor: "pointer",
							_hover: { opacity: 0.8 },
						})}
						onClick={() =>
							openModal(
								<InviteSettingsModal
									groupName={groupName}
									inviteId={inviteId}
									expirationDate={expirationDate}
								/>,
							)
						}
					>
						Edit invite link
					</button>
				</HStack>
			</VStack>
		</Modal>
	)
}
