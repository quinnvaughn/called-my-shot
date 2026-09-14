import { useRouteContext } from "@tanstack/react-router"
import { FiTrendingUp } from "react-icons/fi"
import { css } from "styled-system/css"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { streakTarget } from "../achievement-target"
import { NotificationShell } from "../notification-shell"

export const StreakMilestoneRowFragment = graphql(`
	fragment StreakMilestoneRow_notification on StreakMilestoneNotification {
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
	notification: FragmentType<typeof StreakMilestoneRowFragment>
	unread: boolean
	onOpen: (id: string) => void
}

export function StreakMilestoneRow({
	notification: notificationProp,
	unread,
	onOpen,
}: Props) {
	const n = useFragment(StreakMilestoneRowFragment, notificationProp)
	const { me } = useRouteContext({ from: "__root__" })

	return (
		<NotificationShell
			id={n.id}
			unread={unread}
			createdAt={n.createdAt}
			icon={FiTrendingUp}
			target={streakTarget(me?.username, n.league?.slug, n.streakFamily)}
			onOpen={onOpen}
		>
			<p className={css({ fontSize: "sm" })}>{n.message}</p>
		</NotificationShell>
	)
}
