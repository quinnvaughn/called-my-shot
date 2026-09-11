import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { Card } from "#/components/ui/card"
import { CopyLinkRow } from "#/components/ui/copy-link-row"
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
}

// Deliberately says nothing about where the link will be posted. A group can
// come from a group chat, a fantasy league, a subreddit or a Discord server.
export function GroupInviteCard({
	groupId,
	groupName,
	memberCount,
	inviteCode,
}: Props) {
	if (memberCount >= SMALL_GROUP_MEMBER_LIMIT) return null

	const path = `/groups/join/${inviteCode}`

	return (
		<Card size="sm">
			<Card.Body>
				<VStack gap="4" alignItems="stretch">
					<VStack gap="1.5" alignItems="flex-start">
						<h2
							className={css({
								fontFamily: "heading",
								fontSize: "2xl",
								lineHeight: "tight",
							})}
						>
							A leaderboard is only as good as who's on it
						</h2>
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
