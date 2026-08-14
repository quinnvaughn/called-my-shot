import { graphql } from "#/graphql/generated"

// Initial page load - league tabs, the first page of the feed (HOT, no
// filters), and the full team/player list the search autocomplete filters
// client-side, all in one round trip. Filter/sort/league changes after that
// go through HomeFeedDocument instead, same split as LeaderboardPageDocument
// / LeaderboardDocument. teams/players are deliberately NOT scoped to any one
// league - picking a team from search can (and should) jump the league tabs
// to match it, e.g. searching "Celtics" while the NFL tab is active, so the
// suggestion list itself has to span every league up front.
export const HomePageDocument = graphql(`
    query HomePage {
        leagues {
            id
            name
            abbreviation
            slug
        }
        teams {
            id
            name
            abbreviation
            color
            league {
                id
                abbreviation
            }
        }
        players {
            id
            name
            currentTeam {
                id
                abbreviation
                color
                league {
                    id
                    abbreviation
                }
            }
        }
        questions(first: 10) {
            items {
                id
                ...QuestionCard_question
            }
            pageInfo {
                hasNextPage
                endCursor
            }
        }
    }
`)

export const HomeFeedDocument = graphql(`
    query HomeFeed(
        $first: Int
        $after: String
        $leagueId: ID
        $teamId: ID
        $search: String
        $sort: QuestionSortOrder
    ) {
        questions(
            first: $first
            after: $after
            leagueId: $leagueId
            teamId: $teamId
            search: $search
            sort: $sort
        ) {
            items {
                id
                ...QuestionCard_question
            }
            pageInfo {
                hasNextPage
                endCursor
            }
        }
    }
`)
