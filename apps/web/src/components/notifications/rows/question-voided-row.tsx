import { FiXCircle } from "react-icons/fi"
import { css } from "styled-system/css"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { NotificationShell } from "../notification-shell"

export const QuestionVoidedRowFragment = graphql(`
	fragment QuestionVoidedRow_notification on QuestionVoidedNotification {
		id
		createdAt
		questionTitle
		strikeCount
	}
`)

type Props = {
	notification: FragmentType<typeof QuestionVoidedRowFragment>
	unread: boolean
	onOpen: (id: string) => void
}

// Notifies the question's creator - see voidQuestion. Never links anywhere:
// voidQuestion hard-deletes the question, so there's no live page left to
// send someone to.
export function QuestionVoidedRow({
	notification: notificationProp,
	unread,
	onOpen,
}: Props) {
	const n = useFragment(QuestionVoidedRowFragment, notificationProp)

	return (
		<NotificationShell
			id={n.id}
			unread={unread}
			createdAt={n.createdAt}
			icon={FiXCircle}
			target={null}
			onOpen={onOpen}
		>
			<p className={css({ fontSize: "sm" })}>
				Your question "{n.questionTitle}" was voided
				{n.strikeCount !== null && ` (strike ${n.strikeCount})`}
			</p>
		</NotificationShell>
	)
}
