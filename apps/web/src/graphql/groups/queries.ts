import { graphql } from "#/graphql/generated"
import { gqlQueryOptions } from "#/graphql/query-options"

export const MyGroupsDocument = graphql(`
    query MyGroups {
        myGroups {
            id
            ...GroupCard_group
        }
    }
`)

// Just enough of each group to list it in the sidebar. Its own operation
// rather than MyGroupsDocument, which spreads the whole GroupCard_group.
export const SidebarGroupsDocument = graphql(`
    query SidebarGroups {
        myGroups {
            id
            name
            logoUrl
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
            leaders {
                rank
                name
                username
                avatarUrl
                points
            }
            viewerIsMember
            recentCalls {
                id
                ...CallCard_call
            }
        }
    }
`)

// Fetched by the Leaderboard tab's loader ahead of the board itself: the
// filter resolves against the leagues this group tracks, and the board
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
            recapLinksEnabled
            recapShowsWorstMiss
            viewerHiddenFromRecaps
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

// The group's header, which every tab under /groups/:groupId shares. Read by
// the tabs' layout route, so switching tabs doesn't refetch it.
export const GroupShellDocument = graphql(`
    query GroupShell($groupId: ID!) {
        group(id: $groupId) {
            id
            name
            description
            logoUrl
            bannerUrl
            memberCount
            viewerIsMember
            viewerIsAdmin
            links {
                id
                url
                label
            }
            myInvite {
                id
                code
                expiresAt
            }
        }
    }
`)

// The Home tab: what's happening in the group right now. Per-tab connections
// spread the same fragments their standalone paginated queries use
// (AnsweredQuestionsTab_call, etc.) - see components/groups/
// *-questions-tab.tsx, colocated with the components that render them - so
// the first page of each is handed to its infinite cache rather than costing
// a request.
export const GroupHomeDocument = graphql(`
    query GroupHome(
        $groupId: ID!
        $answeredAfter: String
        $createdAfter: String
        $sharedAfter: String
    ) {
        group(id: $groupId) {
            id
            viewerIsAdmin
            pins {
                ...GroupPinnedStrip_pin
            }
            ballots {
                ...GroupBallotsStrip_groupBallot
            }
            presserHighlights {
                ...GroupPresserStrip_highlight
            }
            challengeHighlights {
                ...GroupChallengeStrip_challenge
            }
            currentRecap {
                ...GroupRecapCard_recap
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

// A recap by its share token, for /recaps/:token. Public: the token is the
// whole of the access check.
export const GroupRecapPageDocument = graphql(`
    query GroupRecapPage($token: String!) {
        groupRecap(token: $token) {
            id
            groupName
            groupId
            weekLabel
            cardVersion
            record {
                wins
                losses
                activeMembers
            }
            ...GroupRecapCard_recap
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
                    statusDetail
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

export const groupCrumbQuery = (groupId: string) =>
	gqlQueryOptions(GroupCrumbDocument, { groupId })
