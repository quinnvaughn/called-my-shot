import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { FiX } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Card } from "#/components/ui/card"
import { CopyLinkRow } from "#/components/ui/copy-link-row"
import { useGqlMutation } from "#/graphql/hooks"
import { DismissGroupInviteCardDocument } from "#/graphql/mutations/groups"
import { track } from "#/lib/analytics"
import { SITE_HOST, SITE_ORIGIN } from "#/lib/meta"
import { pluralize } from "#/lib/pluralize"

// Below this many members the group page carries the invite link inline, so
// sharing it doesn't depend on someone finding the header's Invite button.
const SMALL_GROUP_MEMBER_LIMIT = 12

type Props = {
	groupId: string
	groupName: string
	memberCount: number
	inviteCode: string
	// This member hid the card for this group. Nobody else's card is affected.
	dismissed: boolean
}

// Deliberately says nothing about where the link will be posted. A group can
// come from a group chat, a fantasy league, a subreddit or a Discord server.
export function GroupInviteCard({
	groupId,
	groupName,
	memberCount,
	inviteCode,
	dismissed,
}: Props) {
	const queryClient = useQueryClient()
	const dismiss = useGqlMutation(DismissGroupInviteCardDocument)
	// Hides on click and saves behind it, the same as the onboarding
	// checklist's dismiss. Nothing else on the page waits on the write.
	const [dismissedLocally, setDismissedLocally] = useState(false)

	if (dismissed || dismissedLocally || memberCount >= SMALL_GROUP_MEMBER_LIMIT) {
		return null
	}

	function handleDismiss() {
		track("group_invite_card_dismissed", { groupId, memberCount })
		setDismissedLocally(true)
		dismiss.mutate(
			{ groupId },
			// Marks the group page stale, so coming back to it reads the saved
			// flag instead of a cached copy that still shows the card.
			{ onSuccess: () => queryClient.invalidateQueries() },
		)
	}

	const path = `/groups/join/${inviteCode}`

	return (
		<Card size="sm">
			<Card.Body>
				<VStack gap="4" alignItems="stretch">
					<VStack gap="1.5" alignItems="stretch">
						<HStack justify="space-between" alignItems="flex-start" gap="3">
							<h2
								className={css({
									fontFamily: "heading",
									fontSize: "2xl",
									lineHeight: "tight",
								})}
							>
								A leaderboard is only as good as who's on it
							</h2>
							<button
								type="button"
								aria-label="Hide invite card"
								onClick={handleDismiss}
								className={css({
									display: "flex",
									flexShrink: 0,
									color: "fg.subtle",
									cursor: "pointer",
									_hover: { color: "fg.default" },
								})}
							>
								<FiX size={16} />
							</button>
						</HStack>
						<p className={css({ fontSize: "sm", color: "fg.muted" })}>
							{memberCount} {pluralize(memberCount, "member")} so far. Invite
							the people you most want to beat.
						</p>
					</VStack>
					<CopyLinkRow
						url={`${SITE_ORIGIN}${path}`}
						displayUrl={`${SITE_HOST}${path}`}
						shareTitle={`Join ${groupName} on Called My Shot`}
						onCopied={() =>
							track("group_invite_shared", {
								groupId,
								method: "clipboard",
								surface: "group_card",
							})
						}
						onNativeShared={() =>
							track("group_invite_shared", {
								groupId,
								method: "native",
								surface: "group_card",
							})
						}
					/>
				</VStack>
			</Card.Body>
		</Card>
	)
}
