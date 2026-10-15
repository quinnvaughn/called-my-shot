import { graphql } from "#/graphql/generated"
import {
	EMPTY_CONNECTION,
	gqlInfiniteQueryOptions,
	gqlQueryOptions,
} from "#/graphql/query-options"

// Each notification type on the wire is its own GraphQL type (see
// NotificationNode in apps/api/src/graphql/types/notification.ts) - one
// inline fragment per type here, not one flat shape with every type's
// fields bolted on as optional. __typename is what the frontend dispatches
// on (see notification-row.tsx's per-type components).
export const NotificationsPageDocument = graphql(`
	query NotificationsPage($first: Int, $after: String) {
		notifications(first: $first, after: $after) {
			__typename
			... on QueryNotificationsSuccess {
				data {
					items {
						__typename
						id
						readAt
						...CallResolvedRow_notification
						...DisputeFiledRow_notification
						...DisputeUpheldRow_notification
						...DisputeOverturnedRow_notification
						...QuestionVoidedRow_notification
						...CallVoidedRow_notification
						...GroupMemberJoinedRow_notification
						...GroupPinsExpiredRow_notification
						...QuestionSharedToGroupRow_notification
						...SweepCompletedRow_notification
						...StreakMilestoneRow_notification
						...StreakPersonalBestRow_notification
						...StreakSnappedRow_notification
						...GameReminderRow_notification
						...GameResolvedRow_notification
						...RedoEarnedRow_notification
						...PresserQuestionRow_notification
						...PresserAnsweredRow_notification
						...ChallengeAcceptedRow_notification
						...ChallengeSettledRow_notification
						...ChallengeGloatedRow_notification
						...ChallengePostedToGroupRow_notification
					}
					pageInfo {
						hasNextPage
						endCursor
					}
				}
			}
			... on AuthenticationError {
				message
			}
		}
	}
`)

export const UnreadNotificationCountDocument = graphql(`
	query UnreadNotificationCount {
		unreadNotificationCount {
			__typename
			... on QueryUnreadNotificationCountSuccess {
				data
			}
			... on AuthenticationError {
				message
			}
		}
	}
`)

export const MarkNotificationsReadDocument = graphql(`
	mutation MarkNotificationsRead($ids: [ID!]) {
		markNotificationsRead(ids: $ids) {
			__typename
			... on MutationMarkNotificationsReadSuccess {
				data
			}
			... on AuthenticationError {
				message
			}
		}
	}
`)

export const notificationsQuery = () =>
	gqlInfiniteQueryOptions(NotificationsPageDocument, {}, (data) =>
		data.notifications.__typename === "QueryNotificationsSuccess"
			? data.notifications.data
			: EMPTY_CONNECTION,
	)

export const unreadNotificationCountQuery = gqlQueryOptions(
	UnreadNotificationCountDocument,
	{},
)
