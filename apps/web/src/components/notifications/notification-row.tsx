import { match } from "ts-pattern"
import type { NotificationsPageQuery } from "#/graphql/generated/graphql"
import { CallResolvedRow } from "./rows/call-resolved-row"
import { DisputeFiledRow } from "./rows/dispute-filed-row"
import { DisputeOverturnedRow } from "./rows/dispute-overturned-row"
import { DisputeUpheldRow } from "./rows/dispute-upheld-row"
import { GroupMemberJoinedRow } from "./rows/group-member-joined-row"
import { QuestionSharedToGroupRow } from "./rows/question-shared-to-group-row"
import { QuestionVoidedRow } from "./rows/question-voided-row"

export type NotificationItem = NonNullable<
	Extract<
		NotificationsPageQuery["notifications"],
		{ __typename: "QueryNotificationsSuccess" }
	>["data"]["items"][number]
>

type Props = {
	notification: NotificationItem
	unread: boolean
	onOpen: (id: string) => void
}

// The dispatcher - each notification type is its own component with its own
// fragment/layout/metadata (see ./rows), not one generic card branching on a
// `type` field. __typename is what distinguishes them on the wire (see
// NotificationNode in apps/api/src/graphql/types/notification.ts); this is
// the one place that turns that into "which component renders it."
export function NotificationRow({ notification, unread, onOpen }: Props) {
	return match(notification)
		.with({ __typename: "CallResolvedNotification" }, (n) => (
			<CallResolvedRow notification={n} unread={unread} onOpen={onOpen} />
		))
		.with({ __typename: "DisputeFiledNotification" }, (n) => (
			<DisputeFiledRow notification={n} unread={unread} onOpen={onOpen} />
		))
		.with({ __typename: "DisputeUpheldNotification" }, (n) => (
			<DisputeUpheldRow notification={n} unread={unread} onOpen={onOpen} />
		))
		.with({ __typename: "DisputeOverturnedNotification" }, (n) => (
			<DisputeOverturnedRow notification={n} unread={unread} onOpen={onOpen} />
		))
		.with({ __typename: "QuestionVoidedNotification" }, (n) => (
			<QuestionVoidedRow notification={n} unread={unread} onOpen={onOpen} />
		))
		.with({ __typename: "GroupMemberJoinedNotification" }, (n) => (
			<GroupMemberJoinedRow notification={n} unread={unread} onOpen={onOpen} />
		))
		.with({ __typename: "QuestionSharedToGroupNotification" }, (n) => (
			<QuestionSharedToGroupRow
				notification={n}
				unread={unread}
				onOpen={onOpen}
			/>
		))
		.exhaustive()
}
