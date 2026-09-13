import { FiSlash } from "react-icons/fi"
import { css } from "styled-system/css"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { NotificationShell, type Target } from "../notification-shell"

export const CallVoidedRowFragment = graphql(`
	fragment CallVoidedRow_notification on CallVoidedNotification {
		id
		createdAt
		questionTitle
		question {
			id
		}
	}
`)

type Props = {
	notification: FragmentType<typeof CallVoidedRowFragment>
	unread: boolean
	onOpen: (id: string) => void
}

// Every caller on a voided question gets one - see markQuestionVoided. The
// question still exists, so unlike QuestionVoidedRow this links to it.
export function CallVoidedRow({
	notification: notificationProp,
	unread,
	onOpen,
}: Props) {
	const n = useFragment(CallVoidedRowFragment, notificationProp)
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
			icon={FiSlash}
			target={target}
			onOpen={onOpen}
		>
			<p className={css({ fontSize: "sm" })}>
				"{n.questionTitle}" was voided, so your call on it doesn't score
			</p>
		</NotificationShell>
	)
}
