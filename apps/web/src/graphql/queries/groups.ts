import { graphql } from "#/graphql/generated"

export const MyGroupsDocument = graphql(`
    query MyGroups {
        myGroups {
            id
            ...GroupCard_group
        }
    }
`)

export const GroupPreviewDocument = graphql(`
    query GroupPreview($code: String!) {
        groupPreview(code: $code) {
            id
            name
            memberCount
            invitedBy {
                name
                username
            }
            members {
                id
                name
            }
            topScorer {
                name
                username
                points
            }
        }
    }
`)

// Per-tab connections spread the same fragments their standalone paginated
// queries use (AnsweredQuestionsTab_call, etc.) - see components/groups/
// *-questions-tab.tsx, colocated with the components that render them.
// leaderboard/leagues are colocated the same way with group-leaderboard.tsx.
export const GroupDetailDocument = graphql(`
    query GroupDetail(
        $groupId: ID!
        $answeredAfter: String
        $createdAfter: String
        $sharedAfter: String
    ) {
        leagues {
            id
            name
            abbreviation
            slug
        }
        group(id: $groupId) {
            id
            name
            memberCount
            viewerIsAdmin
            viewerRank
            myInvite {
                id
                code
                expiresAt
            }
            leaderboard(first: 10) {
                items {
                    rank
                    user {
                        id
                    }
                    ...GroupLeaderboard_entry
                }
                pageInfo {
                    hasNextPage
                    endCursor
                }
            }
            viewerLeaderboardEntry {
                ...GroupLeaderboard_entry
            }
            answeredQuestions(first: 10, after: $answeredAfter) {
                items {
                    id
                    ...AnsweredQuestionsTab_call
                }
                pageInfo {
                    hasNextPage
                    endCursor
                }
            }
            createdQuestions(first: 10, after: $createdAfter) {
                items {
                    id
                    ...CreatedQuestionsTab_question
                }
                pageInfo {
                    hasNextPage
                    endCursor
                }
            }
            sharedQuestions(first: 10, after: $sharedAfter) {
                items {
                    id
                    ...SharedQuestionsTab_questionShare
                }
                pageInfo {
                    hasNextPage
                    endCursor
                }
            }
        }
    }
`)
