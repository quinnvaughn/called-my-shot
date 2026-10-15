import { FiAward } from "react-icons/fi"
import { css } from "styled-system/css"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { useMe } from "#/hooks/use-me"
import { sweepTarget } from "../achievement-target"
import { NotificationShell } from "../notification-shell"

export const SweepCompletedRowFragment = graphql(`
	fragment SweepCompletedRow_notification on SweepCompletedNotification {
		id
		createdAt
		message
		slateKey
		league {
			id
			slug
		}
	}
`)

type Props = {
	notification: FragmentType<typeof SweepCompletedRowFragment>
	unread: boolean
	onOpen: (id: string) => void
}

export function SweepCompletedRow({
	notification: notificationProp,
	unread,
	onOpen,
}: Props) {
	const n = useFragment(SweepCompletedRowFragment, notificationProp)
	const me = useMe()

	return (
		<NotificationShell
			id={n.id}
			unread={unread}
			createdAt={n.createdAt}
			icon={FiAward}
			target={sweepTarget(me?.username, n.league?.slug, n.slateKey)}
			onOpen={onOpen}
		>
			<p className={css({ fontSize: "sm" })}>{n.message}</p>
		</NotificationShell>
	)
}
