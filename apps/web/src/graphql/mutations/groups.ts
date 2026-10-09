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

export const UpdateGroupLinksDocument = graphql(`
	mutation UpdateGroupLinks($input: UpdateGroupLinksInput!) {
		updateGroupLinks(input: $input) {
			__typename
			... on GroupPayload {
				group {
					id
					links {
						id
						url
						label
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

export const SetGroupMemberRoleDocument = graphql(`
	mutation SetGroupMemberRole($groupId: ID!, $userId: ID!, $role: GroupRole!) {
		setGroupMemberRole(groupId: $groupId, userId: $userId, role: $role) {
			__typename
			... on GroupMember {
				id
				role
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

export const RemoveGroupMemberDocument = graphql(`
	mutation RemoveGroupMember($groupId: ID!, $userId: ID!) {
		removeGroupMember(groupId: $groupId, userId: $userId) {
			__typename
			... on AuthenticationError {
				message
			}
			... on AuthorizationError {
				message
			}
			... on ValidationError {
				message
			}
		}
	}
`)

export const LeaveGroupDocument = graphql(`
	mutation LeaveGroup($groupId: ID!) {
		leaveGroup(groupId: $groupId) {
			__typename
			... on AuthenticationError {
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

export const DeleteGroupDocument = graphql(`
	mutation DeleteGroup($groupId: ID!) {
		deleteGroup(groupId: $groupId) {
			__typename
			... on AuthenticationError {
				message
			}
			... on AuthorizationError {
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

export const PinQuestionToGroupDocument = graphql(`
	mutation PinQuestionToGroup($groupId: ID!, $questionId: ID!) {
		pinQuestionToGroup(groupId: $groupId, questionId: $questionId) {
			__typename
			... on GroupPayload {
				group {
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

export const UnpinQuestionFromGroupDocument = graphql(`
	mutation UnpinQuestionFromGroup($groupId: ID!, $questionId: ID!) {
		unpinQuestionFromGroup(groupId: $groupId, questionId: $questionId) {
			__typename
			... on GroupPayload {
				group {
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

export const AddBallotToGroupDocument = graphql(`
	mutation AddBallotToGroup($groupId: ID!, $ballotId: ID!) {
		addBallotToGroup(groupId: $groupId, ballotId: $ballotId) {
			__typename
			... on GroupPayload {
				group {
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

export const RemoveBallotFromGroupDocument = graphql(`
	mutation RemoveBallotFromGroup($groupId: ID!, $ballotId: ID!) {
		removeBallotFromGroup(groupId: $groupId, ballotId: $ballotId) {
			__typename
			... on GroupPayload {
				group {
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

export const SetGroupPinOrderDocument = graphql(`
	mutation SetGroupPinOrder($groupId: ID!, $pinIds: [ID!]!) {
		setGroupPinOrder(groupId: $groupId, pinIds: $pinIds) {
			__typename
			... on GroupPayload {
				group {
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
