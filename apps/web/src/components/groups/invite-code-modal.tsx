import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { InviteSettingsModal } from "#/components/groups/invite-settings-modal"
import { CopyLinkRow } from "#/components/ui/copy-link-row"
import { track } from "#/lib/analytics"
import { SITE_HOST, SITE_ORIGIN } from "#/lib/meta"
import { pluralize } from "#/lib/pluralize"
import { openModal } from "#/stores/modal-store"
import { Modal } from "../ui/modal"

type Props = {
	groupId: string
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
	if (hours < 24) return `Expires in ${hours} ${pluralize(hours, "hour")}`
	const days = Math.round(hours / 24)
	return `Expires in ${days} ${pluralize(days, "day")}`
}

export function InviteCodeModal({
	groupId,
	groupName,
	inviteId,
	inviteCode,
	expirationDate,
}: Props) {
	const path = `/groups/join/${inviteCode}`

	return (
		<Modal size="md">
			<Modal.CloseButton />
			<Modal.Title>Invite to {groupName}</Modal.Title>
			<VStack gap="2" alignItems="stretch">
				<CopyLinkRow
					url={`${SITE_ORIGIN}${path}`}
					displayUrl={`${SITE_HOST}${path}`}
					shareTitle={`Join ${groupName} on Called My Shot`}
					onCopied={() =>
						track("group_invite_shared", {
							groupId,
							method: "clipboard",
							surface: "invite_modal",
						})
					}
					onNativeShared={() =>
						track("group_invite_shared", {
							groupId,
							method: "native",
							surface: "invite_modal",
						})
					}
				/>
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
									groupId={groupId}
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
