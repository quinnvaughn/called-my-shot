import { FiBookmark } from "react-icons/fi"
import { css } from "styled-system/css"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { NotificationShell, type Target } from "../notification-shell"

export const GroupPinsExpiredRowFragment = graphql(`
	fragment GroupPinsExpiredRow_notification on GroupPinsExpiredNotification {
		id
		createdAt
		groupName
		group {
			id
		}
	}
`)

type Props = {
	notification: FragmentType<typeof GroupPinsExpiredRowFragment>
	unread: boolean
	onOpen: (id: string) => void
}

// To a group's admins once the last of its pinned questions locks - see
// expireGroupPins.
export function GroupPinsExpiredRow({
	notification: notificationProp,
	unread,
	onOpen,
}: Props) {
	const n = useFragment(GroupPinsExpiredRowFragment, notificationProp)
	const target: Target = n.group
		? { to: "/groups/$groupId", params: { groupId: n.group.id } }
		: null

	return (
		<NotificationShell
			id={n.id}
			unread={unread}
			createdAt={n.createdAt}
			icon={FiBookmark}
			target={target}
			onOpen={onOpen}
		>
			<p className={css({ fontSize: "sm" })}>
				Your pinned questions in {n.groupName} locked. Pin another so new
				members have something to call.
			</p>
		</NotificationShell>
	)
}
