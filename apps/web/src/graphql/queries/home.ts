import { graphql } from "#/graphql/generated"

// Initial page load - just the league tabs (rendered unconditionally, so
// they can't be lazy) and the first page of the feed (HOT, no filters).
// Filter/sort/league changes after that go through HomeFeedDocument instead,
// same split as LeaderboardPageDocument / LeaderboardDocument. teams and
// players used to be fetched here too - the full catalog of each, 92 and
// 4,776 rows respectively - purely so the search autocomplete could filter
// them client-side. players alone was what was pegging prod's CPU on every
// /home visit. HomeSearchDocument below replaces both with a single
// server-side, per-keystroke, bounded lookup instead - nothing search-related
// loads until someone actually opens the search box.
export const HomePageDocument = graphql(`
    query HomePage {
        leagues {
            id
            name
            abbreviation
            slug
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

// Fired on keystroke (debounced) from the home search box instead of
// filtering client-side copies of the whole teams/players tables. Bounded to
// 5 each, matching MAX_SUGGESTIONS in home-search-bar.tsx. Both in one round
// trip rather than two parallel queries, since they're needed together every
// time the box's contents change.
export const HomeSearchDocument = graphql(`
    query HomeSearch($search: String!) {
        teams(search: $search, first: 5) {
            id
            name
            abbreviation
            color
            league {
                id
                abbreviation
            }
        }
        players(search: $search, first: 5) {
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
    }
`)

export const HomeFeedDocument = graphql(`
    query HomeFeed(
        $first: Int
        $after: String
        $leagueId: ID
        $teamId: ID
        $search: String
        $isOfficial: Boolean
        $sort: QuestionSortOrder
    ) {
        questions(
            first: $first
            after: $after
            leagueId: $leagueId
            teamId: $teamId
            search: $search
            isOfficial: $isOfficial
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
