import { graphql } from "#/graphql/generated"

export const CreateGroupDocument = graphql(`
	mutation CreateGroup($input: CreateGroupInput!) {
		createGroup(input: $input) {
			__typename
			... on GroupPayload {
				group {
					id
					name
					memberCount
				}
			}
			... on ValidationError {
				fieldErrors {
					field
					message
				}
			}
		}
	}
`)

export const JoinGroupByCodeDocument = graphql(`
	mutation JoinGroupByCode($input: JoinGroupInput!) {
		joinGroupByCode(input: $input) {
			__typename
			... on GroupPayload {
				group {
					id
					name
					memberCount
				}
			}
			... on ValidationError {
				fieldErrors {
					field
					message
				}
			}
		}
	}
`)

export const ResetGroupInviteCodeDocument = graphql(`
	mutation ResetGroupInviteCode($inviteId: ID!, $expiry: InviteExpiry!) {
		resetGroupInviteCode(inviteId: $inviteId, expiry: $expiry) {
			__typename
			... on GroupInvite {
				id
				code
				expiresAt
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
			... on ValidationError {
				message
			}
		}
	}
`)

// Returns the group so the flag can be read off the result.
export const DismissGroupInviteCardDocument = graphql(`
	mutation DismissGroupInviteCard($groupId: ID!) {
		dismissGroupInviteCard(groupId: $groupId) {
			__typename
			... on Group {
				id
				viewerDismissedInviteCard
			}
			... on AuthenticationError {
				message
			}
			... on AuthorizationError {
				message
			}
		}
	}
`)

export const UpdateGroupDocument = graphql(`
	mutation UpdateGroup($input: UpdateGroupInput!) {
		updateGroup(input: $input) {
			__typename
			... on GroupPayload {
				group {
					id
					name
					description
					trackedLeagues {
						id
						abbreviation
					}
				}
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
			... on ValidationError {
				fieldErrors {
					field
					message
				}
			}
		}
	}
`)

export const ShareQuestionToGroupDocument = graphql(`
	mutation ShareQuestionToGroup($groupId: ID!, $questionId: ID!) {
		shareQuestionToGroup(groupId: $groupId, questionId: $questionId) {
			__typename
			... on QuestionSharePayload {
				share {
					id
				}
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
			... on ValidationError {
				message
			}
		}
	}
`)
