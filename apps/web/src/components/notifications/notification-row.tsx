import { match } from "ts-pattern"
import type { NotificationsPageQuery } from "#/graphql/generated/graphql"
import { CallFadedRow } from "./rows/call-faded-row"
import { CallResolvedRow } from "./rows/call-resolved-row"
import { CallVoidedRow } from "./rows/call-voided-row"
import { DisputeFiledRow } from "./rows/dispute-filed-row"
import { DisputeOverturnedRow } from "./rows/dispute-overturned-row"
import { DisputeUpheldRow } from "./rows/dispute-upheld-row"
import { FadeGloatedRow } from "./rows/fade-gloated-row"
import { GameReminderRow } from "./rows/game-reminder-row"
import { GameResolvedRow } from "./rows/game-resolved-row"
import { GroupMemberJoinedRow } from "./rows/group-member-joined-row"
import { GroupPinsExpiredRow } from "./rows/group-pins-expired-row"
import { PresserAnsweredRow } from "./rows/presser-answered-row"
import { PresserQuestionRow } from "./rows/presser-question-row"
import { QuestionSharedToGroupRow } from "./rows/question-shared-to-group-row"
import { QuestionVoidedRow } from "./rows/question-voided-row"
import { RedoEarnedRow } from "./rows/redo-earned-row"
import { StreakMilestoneRow } from "./rows/streak-milestone-row"
import { StreakPersonalBestRow } from "./rows/streak-personal-best-row"
import { StreakSnappedRow } from "./rows/streak-snapped-row"
import { SweepCompletedRow } from "./rows/sweep-completed-row"

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
		.with({ __typename: "CallVoidedNotification" }, (n) => (
			<CallVoidedRow notification={n} unread={unread} onOpen={onOpen} />
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
		.with({ __typename: "SweepCompletedNotification" }, (n) => (
			<SweepCompletedRow notification={n} unread={unread} onOpen={onOpen} />
		))
		.with({ __typename: "StreakMilestoneNotification" }, (n) => (
			<StreakMilestoneRow notification={n} unread={unread} onOpen={onOpen} />
		))
		.with({ __typename: "StreakPersonalBestNotification" }, (n) => (
			<StreakPersonalBestRow notification={n} unread={unread} onOpen={onOpen} />
		))
		.with({ __typename: "StreakSnappedNotification" }, (n) => (
			<StreakSnappedRow notification={n} unread={unread} onOpen={onOpen} />
		))
		.with({ __typename: "GameReminderNotification" }, (n) => (
			<GameReminderRow notification={n} unread={unread} onOpen={onOpen} />
		))
		.with({ __typename: "RedoEarnedNotification" }, (n) => (
			<RedoEarnedRow notification={n} unread={unread} onOpen={onOpen} />
		))
		.with({ __typename: "CallFadedNotification" }, (n) => (
			<CallFadedRow notification={n} unread={unread} onOpen={onOpen} />
		))
		.with({ __typename: "FadeGloatedNotification" }, (n) => (
			<FadeGloatedRow notification={n} unread={unread} onOpen={onOpen} />
		))
		.with({ __typename: "GameResolvedNotification" }, (n) => (
			<GameResolvedRow notification={n} unread={unread} onOpen={onOpen} />
		))
		.with({ __typename: "GroupPinsExpiredNotification" }, (n) => (
			<GroupPinsExpiredRow notification={n} unread={unread} onOpen={onOpen} />
		))
		.with({ __typename: "PresserQuestionReceivedNotification" }, (n) => (
			<PresserQuestionRow notification={n} unread={unread} onOpen={onOpen} />
		))
		.with({ __typename: "PresserAnsweredNotification" }, (n) => (
			<PresserAnsweredRow notification={n} unread={unread} onOpen={onOpen} />
		))
		.exhaustive()
}
