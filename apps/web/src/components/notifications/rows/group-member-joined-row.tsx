import { FiUserPlus } from "react-icons/fi"
import { css } from "styled-system/css"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { NotificationShell, type Target } from "../notification-shell"

export const GroupMemberJoinedRowFragment = graphql(`
	fragment GroupMemberJoinedRow_notification on GroupMemberJoinedNotification {
		id
		createdAt
		actorUsername
		groupName
		group {
			id
		}
	}
`)

type Props = {
	notification: FragmentType<typeof GroupMemberJoinedRowFragment>
	unread: boolean
	onOpen: (id: string) => void
}

// Notifies every other current member of the group - see joinGroupByCode.
export function GroupMemberJoinedRow({
	notification: notificationProp,
	unread,
	onOpen,
}: Props) {
	const n = useFragment(GroupMemberJoinedRowFragment, notificationProp)
	const target: Target = n.group
		? { to: "/groups/$groupId", params: { groupId: n.group.id } }
		: null

	return (
		<NotificationShell
			id={n.id}
			unread={unread}
			createdAt={n.createdAt}
			icon={FiUserPlus}
			target={target}
			onOpen={onOpen}
		>
			<p className={css({ fontSize: "sm" })}>
				<b>@{n.actorUsername}</b> joined {n.groupName}
			</p>
		</NotificationShell>
	)
}
