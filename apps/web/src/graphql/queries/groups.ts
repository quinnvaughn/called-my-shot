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
// leaderboard is colocated the same way with group-leaderboard.tsx.
//
// The leaderboard's scope comes in as variables so its embedded first page is
// the one the route actually renders (the loader seeds the infinite cache
// with it) - a link to a filtered board shouldn't have to fetch the default
// board first. The leagues themselves come from _app's router context rather
// than being selected here.
export const GroupDetailDocument = graphql(`
    query GroupDetail(
        $groupId: ID!
        $leagueId: ID
        $season: SeasonFilterInput
        $answeredAfter: String
        $createdAfter: String
        $sharedAfter: String
    ) {
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
            leaderboard(first: 10, leagueId: $leagueId, season: $season) {
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
            viewerLeaderboardEntry(leagueId: $leagueId, season: $season) {
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
