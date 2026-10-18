import { FiFlag } from "react-icons/fi"
import { css } from "styled-system/css"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { NotificationShell, type Target } from "../notification-shell"

export const DisputeFiledRowFragment = graphql(`
	fragment DisputeFiledRow_notification on DisputeFiledNotification {
		id
		createdAt
		questionTitle
		actorUsername
		question {
			id
		}
	}
`)

type Props = {
	notification: FragmentType<typeof DisputeFiledRowFragment>
	unread: boolean
	onOpen: (id: string) => void
}

// Notifies the question's creator - see fileDispute. Neutral, not a
// win/loss for them yet (an admin still has to uphold or overturn it).
export function DisputeFiledRow({
	notification: notificationProp,
	unread,
	onOpen,
}: Props) {
	const n = useFragment(DisputeFiledRowFragment, notificationProp)
	const target: Target = n.question
		? {
				to: "/questions/$questionId/{-$slug}",
				params: { questionId: n.question.id },
			}
		: null

	return (
		<NotificationShell
			id={n.id}
			unread={unread}
			createdAt={n.createdAt}
			icon={FiFlag}
			target={target}
			onOpen={onOpen}
		>
			<p className={css({ fontSize: "sm" })}>
				<b>@{n.actorUsername}</b> disputed your resolution on "{n.questionTitle}
				"
			</p>
		</NotificationShell>
	)
}
