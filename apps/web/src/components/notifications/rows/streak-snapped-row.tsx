import { FiMinusCircle } from "react-icons/fi"
import { css } from "styled-system/css"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { useMe } from "#/hooks/use-me"
import { streakTarget } from "../achievement-target"
import { NotificationShell } from "../notification-shell"

export const StreakSnappedRowFragment = graphql(`
	fragment StreakSnappedRow_notification on StreakSnappedNotification {
		id
		createdAt
		message
		streakFamily
		league {
			id
			slug
		}
	}
`)

type Props = {
	notification: FragmentType<typeof StreakSnappedRowFragment>
	unread: boolean
	onOpen: (id: string) => void
}

export function StreakSnappedRow({
	notification: notificationProp,
	unread,
	onOpen,
}: Props) {
	const n = useFragment(StreakSnappedRowFragment, notificationProp)
	const me = useMe()

	return (
		<NotificationShell
			id={n.id}
			unread={unread}
			createdAt={n.createdAt}
			icon={FiMinusCircle}
			target={streakTarget(me?.username, n.league?.slug, n.streakFamily)}
			onOpen={onOpen}
		>
			<p className={css({ fontSize: "sm" })}>{n.message}</p>
		</NotificationShell>
	)
}
