import { useQueryClient } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { ConfirmActionModal } from "#/components/ui/confirm-action-modal"
import {
	GroupSettingsDocument,
	GroupShellDocument,
	ResetGroupInviteCodeDocument,
} from "#/graphql/generated/graphql"
import { useGqlMutation } from "#/graphql/hooks"
import { gqlQueryPrefix } from "#/graphql/query-options"
import { formatShortDate } from "#/lib/format-date"
import { openModal } from "#/stores/modal-store"

export type SettingsInvite = {
	id: string
	code: string
	expiresAt: string | null
	creator: { id: string; name: string; username: string }
}

type Props = {
	invites: SettingsInvite[]
}

const truncate = css({
	minWidth: "0",
	maxWidth: "full",
	truncate: true,
})

function expiryLabel(expiresAt: string | null) {
	if (expiresAt === null) return "Never expires"
	if (new Date(expiresAt).getTime() < Date.now()) return "Expired"
	return `Expires ${formatShortDate(expiresAt)}`
}

// Admins only. Every member has their own link; this is where an admin kills
// one that's ended up somewhere it shouldn't. Sharing your own link stays on
// the group page's Invite button.
export function GroupInvitesSection({ invites }: Props) {
	const resetInvite = useGqlMutation(ResetGroupInviteCodeDocument)
	const queryClient = useQueryClient()
	const router = useRouter()

	async function reset(invite: SettingsInvite) {
		const data = await resetInvite.mutateAsync({
			inviteId: invite.id,
			expiry: "NO_EXPIRY",
		})
		const result = data?.resetGroupInviteCode
		if (result?.__typename === "GroupInvite") {
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: gqlQueryPrefix(GroupSettingsDocument),
				}),
				queryClient.invalidateQueries({
					queryKey: gqlQueryPrefix(GroupShellDocument),
				}),
			])
			await router.invalidate()
			return null
		}
		return result?.message ?? "Something went wrong. Try again."
	}

	return (
		<Card>
			<Card.Body>
				<VStack alignItems="stretch" gap="1">
					{[...invites]
						.sort((a, b) => a.creator.name.localeCompare(b.creator.name))
						.map((invite) => (
							<HStack key={invite.id} gap="3" minWidth="0" paddingBlock="2">
								<VStack gap="0.5" alignItems="flex-start" minWidth="0" flex="1">
									<span
										className={`${truncate} ${css({ fontSize: "sm", fontWeight: "medium" })}`}
									>
										@{invite.creator.username}
									</span>
									<span
										className={`${truncate} ${css({ textStyle: "metaLg", color: "fg.muted" })}`}
									>
										{invite.code} · {expiryLabel(invite.expiresAt)}
									</span>
								</VStack>
								<Button
									variant="outline"
									size="sm"
									onClick={() =>
										openModal(
											<ConfirmActionModal
												title="Reset invite link"
												confirmLabel="Reset link"
												onConfirm={() => reset(invite)}
											>
												@{invite.creator.username}'s code {invite.code} stops
												working and they get a new one. Anyone they sent the old
												link to will need the new one.
											</ConfirmActionModal>,
										)
									}
								>
									Reset
								</Button>
							</HStack>
						))}
				</VStack>
			</Card.Body>
		</Card>
	)
}
