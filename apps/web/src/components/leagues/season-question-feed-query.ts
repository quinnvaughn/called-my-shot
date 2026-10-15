import type { QueryClient } from "@tanstack/react-query"
import type { QuestionSortOrder } from "#/graphql/generated/graphql"
import {
	gqlInfiniteQueryOptions,
	gqlQueryOptions,
} from "#/graphql/query-options"
import {
	LeagueSeasonClosingSoonDocument,
	LeagueSeasonDocument,
} from "#/graphql/sports/leagues/queries"

// The Season tab's questions: every season-long one that isn't an award (stat
// lines, head-to-heads, leaders, props with no game), official and
// player-written together. Awards and titles live on the Ballots tab, and
// game questions on each game's page.
const SEASON_VARIABLES = {
	seasonLong: true,
	excludeSeasonAwards: true,
	excludeBallotMembers: true,
} as const

export const DEFAULT_SORT: QuestionSortOrder = "MOST_CALLED"

// Most Called has no time decay at all - an old season's runaway-popular
// question would otherwise rank at the top forever. New already self-limits
// (an old question has an old createdAt, so it never surfaces there).
function isCurrentSeasonOnly(sort: QuestionSortOrder): boolean {
	return sort === "MOST_CALLED"
}

const PAGE_SIZE = 10

const CLOSING_SOON_LIMIT = 10

export const closingSoonQuery = (leagueId: string) =>
	gqlQueryOptions(LeagueSeasonClosingSoonDocument, {
		leagueId,
		first: CLOSING_SOON_LIMIT,
		...SEASON_VARIABLES,
	})

type FeedFilters = {
	leagueId: string
	sort: QuestionSortOrder
	search?: string
	teamId?: string
}

// Every filter is part of the key, so changing sort, search text or team
// starts a fresh list rather than appending to the previous one.
export function seasonQuestionFeedQuery({
	leagueId,
	sort,
	search,
	teamId,
}: FeedFilters) {
	return gqlInfiniteQueryOptions(
		LeagueSeasonDocument,
		{
			leagueId,
			first: PAGE_SIZE,
			...SEASON_VARIABLES,
			// A selected team is a precise filter on its own - pairing it with
			// the substring `search` (now just that team's own name) would
			// needlessly AND the two together, so teamId wins outright when set.
			...(teamId ? { teamId } : { search: search || undefined }),
			sort,
			// A browse list's job is sourcing things to call - a resolved or
			// disputed question has nothing left to do (without this, a settled
			// question that went viral once could camp the top of Most Called
			// forever).
			excludeSettled: true,
			currentSeasonOnly: isCurrentSeasonOnly(sort),
		},
		(data) => data.questions,
	)
}

// The first page and the Closing Soon row a route preloads before rendering.
export function preloadSeasonQuestionFeed(
	queryClient: QueryClient,
	leagueId: string,
) {
	return Promise.all([
		queryClient.infiniteQuery(
			seasonQuestionFeedQuery({ leagueId, sort: DEFAULT_SORT }),
		),
		queryClient.query(closingSoonQuery(leagueId)),
	])
}
