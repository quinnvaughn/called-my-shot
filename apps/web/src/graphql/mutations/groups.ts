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
					# Selected here so a caller can hand straight into the
					# invite modal without a second round trip. Group.myInvite
					# is non-null: the creator's own link exists the moment the
					# group does.
					myInvite {
						id
						code
						expiresAt
					}
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
