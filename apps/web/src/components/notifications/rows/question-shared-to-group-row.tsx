import { FiUsers } from "react-icons/fi"
import { css } from "styled-system/css"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { NotificationShell, type Target } from "../notification-shell"

export const QuestionSharedToGroupRowFragment = graphql(`
	fragment QuestionSharedToGroupRow_notification on QuestionSharedToGroupNotification {
		id
		createdAt
		actorUsername
		groupName
		questionTitle
		group {
			id
		}
	}
`)

type Props = {
	notification: FragmentType<typeof QuestionSharedToGroupRowFragment>
	unread: boolean
	onOpen: (id: string) => void
}

// Notifies every other member of the group - see shareQuestionToGroup. Links
// to the group (its Shared tab), not the question itself - the point is
// "look what landed in your group", same framing as the group's own feed.
export function QuestionSharedToGroupRow({
	notification: notificationProp,
	unread,
	onOpen,
}: Props) {
	const n = useFragment(QuestionSharedToGroupRowFragment, notificationProp)
	const target: Target = n.group
		? { to: "/groups/$groupId", params: { groupId: n.group.id } }
		: null

	return (
		<NotificationShell
			id={n.id}
			unread={unread}
			createdAt={n.createdAt}
			icon={FiUsers}
			target={target}
			onOpen={onOpen}
		>
			<p className={css({ fontSize: "sm" })}>
				<b>@{n.actorUsername}</b> shared "{n.questionTitle}" with {n.groupName}
			</p>
		</NotificationShell>
	)
}
