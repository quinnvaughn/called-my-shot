import type { QueryClient } from "@tanstack/react-query"
import { graphql } from "#/graphql/generated"
import {
	AdminQueueSummaryDocument,
	AdminUsersDocument,
} from "#/graphql/generated/graphql"
import { invalidateOperations } from "#/graphql/query-options"

// A user's verified badge and question-creation lock: the users table and the
// queue's locked-users count.
export function invalidateAdminUsers(queryClient: QueryClient) {
	return invalidateOperations(queryClient, [
		AdminUsersDocument,
		AdminQueueSummaryDocument,
	])
}

export const SetUserQuestionCreationEnabledDocument = graphql(`
	mutation SetUserQuestionCreationEnabled($userId: ID!, $enabled: Boolean!) {
		setUserQuestionCreationEnabled(userId: $userId, enabled: $enabled) {
			__typename
			... on User {
				id
				questionCreationEnabled
			}
			... on AuthenticationError {
				message
			}
			... on AuthorizationError {
				message
			}
			... on NotFoundError {
				message
			}
		}
	}
`)

export const SetUserVerifiedDocument = graphql(`
	mutation SetUserVerified($userId: ID!, $verified: Boolean!) {
		setUserVerified(userId: $userId, verified: $verified) {
			__typename
			... on User {
				id
				isVerifiedPundit
			}
			... on AuthenticationError {
				message
			}
			... on AuthorizationError {
				message
			}
			... on NotFoundError {
				message
			}
		}
	}
`)
