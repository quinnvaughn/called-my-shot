import { graphql } from "#/graphql/generated"
import { gqlQueryOptions } from "#/graphql/query-options"

// The viewer's groups with each one's boards for today, for "your groups"
// under a finished arcade game and its Send to the group.
export const ArcadeViewerGroupsDocument = graphql(`
	query ArcadeViewerGroups {
		myGroups {
			id
			name
			logoUrl
			myInvite {
				id
				code
			}
			seasonPuzzleBoard {
				today {
					status
				}
			}
			rankBoard {
				today {
					status
				}
			}
		}
	}
`)

export const arcadeViewerGroupsQuery = gqlQueryOptions(
	ArcadeViewerGroupsDocument,
	{},
)

// Whether anything is open to call right now, for the line under a finished
// game that points at today's games. Never shown when it would be a dead end.
export const ArcadeOpenCallsDocument = graphql(`
	query ArcadeOpenCalls {
		leagues {
			id
			nextLockAt
		}
	}
`)

export const arcadeOpenCallsQuery = gqlQueryOptions(ArcadeOpenCallsDocument, {})

// The group a shared result link's invite is for, so the step under a
// finished game can name it.
export const ArcadeInviteGroupDocument = graphql(`
	query ArcadeInviteGroup($code: String!) {
		groupPreview(code: $code) {
			id
			name
			logoUrl
			memberCount
			viewerIsMember
		}
	}
`)

export const arcadeInviteGroupQuery = (code: string) =>
	gqlQueryOptions(ArcadeInviteGroupDocument, { code })

// A group's points from both arcade games this week.
export const GroupArcadeWeekDocument = graphql(`
	query GroupArcadeWeek($groupId: ID!) {
		group(id: $groupId) {
			id
			arcadeWeek {
				points
				played
				user {
					id
					username
					name
					avatarUrl
				}
			}
		}
	}
`)

export const groupArcadeWeekQuery = (groupId: string) =>
	gqlQueryOptions(GroupArcadeWeekDocument, { groupId })
