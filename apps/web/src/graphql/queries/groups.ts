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
            viewerIsMember
            viewerIsAdmin
            links {
                id
                url
                label
            }
            trackedLeagues {
                id
                abbreviation
            }
            pins {
                ...GroupPinsSection_pin
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
            viewerIsMember
            viewerIsAdmin
            viewerDismissedInviteCard
            pins {
                ...GroupPinnedStrip_pin
            }
            links {
                id
                url
                label
            }
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
            liveGames {
                game {
                    id
                    status
                    startsAt
                    league {
                        id
                        abbreviation
                    }
                }
                ...GroupGamesStrip_game
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

// Every member's calls on one game, one row each, for
// /groups/:groupId/games/:gameId. The game carries what GameMatchupHeader
// needs, the same as the picks page it links to.
export const GroupGameBoardDocument = graphql(`
    query GroupGameBoard($groupId: ID!, $gameId: ID!) {
        group(id: $groupId) {
            id
            name
            gameBoard(gameId: $gameId) {
                game {
                    id
                    startsAt
                    status
                    homeScore
                    awayScore
                    venue
                    startTimeTbd
                    postseason {
                        roundLabel
                        homeSeed
                        awaySeed
                        gameNumber
                        ifNecessary
                        summary
                        clinchTeamIds
                    }
                    league {
                        id
                        abbreviation
                        slug
                    }
                    homeTeam {
                        ...Team_team @unmask
                    }
                    awayTeam {
                        ...Team_team @unmask
                    }
                    homeTeamRecord {
                        wins
                        losses
                        ties
                        otLosses
                    }
                    awayTeamRecord {
                        wins
                        losses
                        ties
                        otLosses
                    }
                    # The rail beside the board, from xl up (GameSetRail).
                    officialQuestions {
                        id
                        ...GameSetRail_question
                    }
                    viewerCommunityQuestions {
                        id
                        ...GameSetRail_question
                    }
                }
                entries {
                    user {
                        id
                    }
                    ...GroupGameEntryRow_entry
                }
            }
        }
    }
`)

// Every member's progress on one ballot, for
// /groups/:groupId/ballots/:ballotSlug: the members who've started it, one
// row each, and the ones who haven't.
export const GroupBallotBoardDocument = graphql(`
    query GroupBallotBoard($groupId: ID!, $ballotId: ID!) {
        group(id: $groupId) {
            id
            name
            ballotBoard(ballotId: $ballotId) {
                ballot {
                    id
                    slug
                    name
                    memberCount
                    nextLocksAt
                    league {
                        id
                        abbreviation
                    }
                }
                entries {
                    user {
                        id
                    }
                    calledCount
                    completedAt
                    wins
                    losses
                    ...GroupBallotEntryRow_entry
                }
                notStarted {
                    id
                    ...Identity_user
                }
            }
        }
    }
`)

// The group's name for a picks or entry page's breadcrumb back to a group
// board.
export const GroupCrumbDocument = graphql(`
    query GroupCrumb($groupId: ID!) {
        group(id: $groupId) {
            id
            name
        }
    }
`)
