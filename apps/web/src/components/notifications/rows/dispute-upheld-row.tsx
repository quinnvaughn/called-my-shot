import { FiXCircle } from "react-icons/fi"
import { css } from "styled-system/css"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { NotificationShell, type Target } from "../notification-shell"

export const DisputeUpheldRowFragment = graphql(`
	fragment DisputeUpheldRow_notification on DisputeUpheldNotification {
		id
		createdAt
		questionTitle
		question {
			id
		}
	}
`)

type Props = {
	notification: FragmentType<typeof DisputeUpheldRowFragment>
	unread: boolean
	onOpen: (id: string) => void
}

// Notifies the disputer - see upholdDispute. "Upheld" means the original
// resolution stands, i.e. their challenge didn't succeed - a loss from their
// side, hence the X rather than a check.
export function DisputeUpheldRow({
	notification: notificationProp,
	unread,
	onOpen,
}: Props) {
	const n = useFragment(DisputeUpheldRowFragment, notificationProp)
	const target: Target = n.question
		? { to: "/questions/$questionId", params: { questionId: n.question.id } }
		: null

	return (
		<NotificationShell
			id={n.id}
			unread={unread}
			createdAt={n.createdAt}
			icon={FiXCircle}
			target={target}
			onOpen={onOpen}
		>
			<p className={css({ fontSize: "sm" })}>
				Your dispute on "{n.questionTitle}" was upheld
			</p>
		</NotificationShell>
	)
}
