import { FiUsers } from "react-icons/fi"
import { challengeTarget } from "#/components/notifications/challenge-target"
import { NotificationShell } from "#/components/notifications/notification-shell"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { text } from "./styles"
import type { RowProps } from "./types"

export const ChallengePostedToGroupRowFragment = graphql(`
	fragment ChallengePostedToGroupRow_notification on ChallengePostedToGroupNotification {
		id
		createdAt
		actorUsername
		groupName
		challenge {
			id
			code
		}
	}
`)

// Someone posted a challenge into a group the viewer is in - see
// postChallengeToGroups.
export function ChallengePostedToGroupRow({
	notification,
	unread,
	onOpen,
}: RowProps<FragmentType<typeof ChallengePostedToGroupRowFragment>>) {
	const n = useFragment(ChallengePostedToGroupRowFragment, notification)
	return (
		<NotificationShell
			id={n.id}
			unread={unread}
			createdAt={n.createdAt}
			icon={FiUsers}
			target={challengeTarget(n.challenge)}
			onOpen={onOpen}
		>
			<p className={text}>
				<b>@{n.actorUsername}</b> posted a challenge in {n.groupName}
			</p>
		</NotificationShell>
	)
}
