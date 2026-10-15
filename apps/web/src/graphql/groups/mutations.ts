import type { QueryClient } from "@tanstack/react-query"
import { graphql } from "#/graphql/generated"
import {
	AdminGroupsDocument,
	AnsweredQuestionsDocument,
	BallotByRefDocument,
	ChallengeCandidatesDocument,
	ChallengePostGroupsDocument,
	CreatedQuestionsDocument,
	GameByIdDocument,
	GameOfficialQuestionsDocument,
	GroupBallotBoardDocument,
	GroupCrumbDocument,
	GroupGameBoardDocument,
	GroupHighlightsDocument,
	GroupHomeDocument,
	GroupLeaderboardDocument,
	GroupLeaguesDocument,
	GroupLiveGamesDocument,
	GroupMembersDocument,
	GroupPreviewDocument,
	GroupRecapPageDocument,
	GroupSettingsDocument,
	GroupShellDocument,
	MyGroupsDocument,
	NextUpQuestionDocument,
	NotificationsPageDocument,
	QuestionDetailDocument,
	RecordBookDocument,
	SharedQuestionsDocument,
	ShareTargetGroupsDocument,
	SidebarGroupsDocument,
	ViewerOnboardingDocument,
} from "#/graphql/generated/graphql"
import { gqlQueryKey, invalidateOperations } from "#/graphql/query-options"

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

export const UpdateGroupRecapSettingsDocument = graphql(`
	mutation UpdateGroupRecapSettings($input: GroupRecapSettingsInput!) {
		updateGroupRecapSettings(input: $input) {
			__typename
			... on GroupPayload {
				group {
					id
					recapLinksEnabled
					recapShowsWorstMiss
				}
			}
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

export const SetHiddenFromRecapsDocument = graphql(`
	mutation SetHiddenFromRecaps($groupId: ID!, $hidden: Boolean!) {
		setHiddenFromRecaps(groupId: $groupId, hidden: $hidden) {
			__typename
			... on GroupPayload {
				group {
					id
					viewerHiddenFromRecaps
				}
			}
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

// Every read a change to a group's details or membership can reach: the
// group's own pages, anything that names or lists a group, and the
// viewer-in-a-group reads elsewhere (group pick tallies, a question's share
// and pin state, the get-started checklist's group step).
const GROUP_DOCUMENTS = [
	AdminGroupsDocument,
	AnsweredQuestionsDocument,
	BallotByRefDocument,
	ChallengeCandidatesDocument,
	ChallengePostGroupsDocument,
	CreatedQuestionsDocument,
	GameByIdDocument,
	GameOfficialQuestionsDocument,
	GroupBallotBoardDocument,
	GroupCrumbDocument,
	GroupGameBoardDocument,
	GroupHighlightsDocument,
	GroupHomeDocument,
	GroupLeaderboardDocument,
	GroupLeaguesDocument,
	GroupLiveGamesDocument,
	GroupMembersDocument,
	GroupPreviewDocument,
	GroupRecapPageDocument,
	GroupSettingsDocument,
	GroupShellDocument,
	MyGroupsDocument,
	NextUpQuestionDocument,
	NotificationsPageDocument,
	QuestionDetailDocument,
	RecordBookDocument,
	SharedQuestionsDocument,
	ShareTargetGroupsDocument,
	SidebarGroupsDocument,
	ViewerOnboardingDocument,
]

export function invalidateGroups(queryClient: QueryClient) {
	return invalidateOperations(queryClient, GROUP_DOCUMENTS)
}

// The group page's Home tab and its settings, the two places that show what
// the group has pinned, shared, added and turned on.
export function invalidateGroupBoards(
	queryClient: QueryClient,
	groupId: string,
) {
	return Promise.all([
		queryClient.invalidateQueries({
			queryKey: gqlQueryKey(GroupHomeDocument, { groupId }),
		}),
		queryClient.invalidateQueries({
			queryKey: gqlQueryKey(GroupSettingsDocument, { groupId }),
		}),
	])
}
