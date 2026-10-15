import { FiStar } from "react-icons/fi"
import { css } from "styled-system/css"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { useMe } from "#/hooks/use-me"
import { streakTarget } from "../achievement-target"
import { NotificationShell } from "../notification-shell"

export const StreakPersonalBestRowFragment = graphql(`
	fragment StreakPersonalBestRow_notification on StreakPersonalBestNotification {
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
	notification: FragmentType<typeof StreakPersonalBestRowFragment>
	unread: boolean
	onOpen: (id: string) => void
}

export function StreakPersonalBestRow({
	notification: notificationProp,
	unread,
	onOpen,
}: Props) {
	const n = useFragment(StreakPersonalBestRowFragment, notificationProp)
	const me = useMe()

	return (
		<NotificationShell
			id={n.id}
			unread={unread}
			createdAt={n.createdAt}
			icon={FiStar}
			target={streakTarget(me?.username, n.league?.slug, n.streakFamily)}
			onOpen={onOpen}
		>
			<p className={css({ fontSize: "sm" })}>{n.message}</p>
		</NotificationShell>
	)
}
