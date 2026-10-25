import { FiUserPlus } from "react-icons/fi"
import { NotificationShell } from "#/components/notifications/notification-shell"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { text } from "./styles"
import type { RowProps } from "./types"

export const UserFollowedRowFragment = graphql(`
	fragment UserFollowedRow_notification on UserFollowedNotification {
		id
		createdAt
		actorUsername
		actor {
			id
			username
		}
	}
`)

// Someone followed the viewer - see follow. In the app only, never pushed
// or emailed.
export function UserFollowedRow({
	notification,
	unread,
	onOpen,
}: RowProps<FragmentType<typeof UserFollowedRowFragment>>) {
	const n = useFragment(UserFollowedRowFragment, notification)
	return (
		<NotificationShell
			id={n.id}
			unread={unread}
			createdAt={n.createdAt}
			icon={FiUserPlus}
			target={
				n.actor
					? { to: "/user/$username", params: { username: n.actor.username } }
					: null
			}
			onOpen={onOpen}
		>
			<p className={text}>
				<b>@{n.actor?.username ?? n.actorUsername ?? "someone"}</b> followed you
			</p>
		</NotificationShell>
	)
}
