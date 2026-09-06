import { FiCheckCircle } from "react-icons/fi"
import { css } from "styled-system/css"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { NotificationShell, type Target } from "../notification-shell"

export const DisputeOverturnedRowFragment = graphql(`
	fragment DisputeOverturnedRow_notification on DisputeOverturnedNotification {
		id
		createdAt
		questionTitle
		question {
			id
		}
	}
`)

type Props = {
	notification: FragmentType<typeof DisputeOverturnedRowFragment>
	unread: boolean
	onOpen: (id: string) => void
}

// Notifies the disputer - see overturnDispute. Their challenge succeeded;
// a CallResolvedNotification for the corrected points usually follows this
// one as its own separate notification.
export function DisputeOverturnedRow({
	notification: notificationProp,
	unread,
	onOpen,
}: Props) {
	const n = useFragment(DisputeOverturnedRowFragment, notificationProp)
	const target: Target = n.question
		? { to: "/questions/$questionId/{-$slug}", params: { questionId: n.question.id } }
		: null

	return (
		<NotificationShell
			id={n.id}
			unread={unread}
			createdAt={n.createdAt}
			icon={FiCheckCircle}
			target={target}
			onOpen={onOpen}
		>
			<p className={css({ fontSize: "sm" })}>
				Your dispute on "{n.questionTitle}" was overturned
			</p>
		</NotificationShell>
	)
}
