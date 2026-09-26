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
            description
            logoUrl
            bannerUrl
            memberCount
            invitedBy {
                name
                username
                avatarUrl
            }
            members {
                id
                name
                avatarUrl
            }
            trackedLeagues {
                abbreviation
            }
            topScorer {
                name
                username
                points
            }
            recentCalls {
                id
                ...CallCard_call
            }
        }
    }
`)

// Fetched ahead of GroupDetail by the group route's loader: the leaderboard
// filter resolves against the leagues this group tracks, and GroupDetail
// needs that resolved scope as its variables.
export const GroupLeaguesDocument = graphql(`
    query GroupLeagues($groupId: ID!) {
        group(id: $groupId) {
            id
            trackedLeagues {
                id
                abbreviation
            }
        }
    }
`)

// invites comes back empty for anyone who isn't an admin, same as the
// admin-only sections that render it.
export const GroupSettingsDocument = graphql(`
    query GroupSettings($groupId: ID!) {
        group(id: $groupId) {
            id
            name
            description
            logoUrl
            bannerUrl
            viewerIsAdmin
            trackedLeagues {
                id
                abbreviation
            }
            members {
                id
                role
                joinedAt
                user {
                    id
                    name
                    username
                    avatarUrl
                }
            }
            invites {
                id
                code
                expiresAt
                creator {
                    id
                    name
                    username
                }
            }
        }
    }
`)

// Per-tab connections spread the same fragments their standalone paginated
// queries use (AnsweredQuestionsTab_call, etc.) - see components/groups/
// *-questions-tab.tsx, colocated with the components that render them.
// leaderboard is colocated the same way with group-leaderboard.tsx.
//
// The four highlights lists take their three each here and are read straight
// off this result - unlike the lists above they don't paginate, so the band
// costs no request of its own and needs no seeding. Only the sheet behind its
// "see all" queries separately, for the full fifty.
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
            description
            logoUrl
            bannerUrl
            memberCount
            viewerIsAdmin
            viewerDismissedInviteCard
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
            hotStreaks(limit: 3) {
                ...GroupHighlights_streak
            }
            coldStreaks(limit: 3) {
                ...GroupHighlights_streak
            }
            streakRecords(limit: 3) {
                ...GroupHighlights_streak
            }
            recentSweeps(limit: 3) {
                ...GroupHighlights_sweep
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
