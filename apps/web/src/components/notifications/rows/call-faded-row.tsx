import { FiCornerUpLeft } from "react-icons/fi"
import { css } from "styled-system/css"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { NotificationShell, type Target } from "../notification-shell"

export const CallFadedRowFragment = graphql(`
	fragment CallFadedRow_notification on CallFadedNotification {
		id
		createdAt
		actorUsername
		questionTitle
		call {
			id
		}
	}
`)

type Props = {
	notification: FragmentType<typeof CallFadedRowFragment>
	unread: boolean
	onOpen: (id: string) => void
}

// Someone took the other side of this user's call and aimed it at them - see
// recordFade. Opens the faded call, where the fader is listed under Doubters.
export function CallFadedRow({
	notification: notificationProp,
	unread,
	onOpen,
}: Props) {
	const n = useFragment(CallFadedRowFragment, notificationProp)
	const target: Target = n.call
		? { to: "/calls/$callId", params: { callId: n.call.id } }
		: null

	return (
		<NotificationShell
			id={n.id}
			unread={unread}
			createdAt={n.createdAt}
			icon={FiCornerUpLeft}
			target={target}
			onOpen={onOpen}
		>
			<p className={css({ fontSize: "sm" })}>
				<b>@{n.actorUsername}</b> faded your call on "{n.questionTitle}"
			</p>
		</NotificationShell>
	)
}
