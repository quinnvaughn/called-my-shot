import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { VStack } from "styled-system/jsx"
import {
	GroupHighlights,
	groupHighlightsQuery,
} from "#/components/groups/group-highlights"
import {
	GroupLeaderboard,
	groupLeaderboardQuery,
} from "#/components/groups/group-leaderboard"
import { GroupLeaguesDocument } from "#/graphql/generated/graphql"
import { groupShellQuery } from "#/graphql/groups/queries"
import { gqlQueryOptions } from "#/graphql/query-options"
import { useMe } from "#/hooks/use-me"
import {
	type FilterLeague,
	leaderboardSearchSchema,
	resolveLeaderboardFilter,
} from "#/lib/leaderboard-filter"

const groupLeaguesQuery = (groupId: string) =>
	gqlQueryOptions(GroupLeaguesDocument, { groupId })

// The site's leagues narrowed to the ones this group tracks, and what the
// leaderboard's All tab should call that set. A group tracking every league
// (no tracked rows) keeps the full list and the default label.
function groupLeagueScope(
	leagues: FilterLeague[],
	tracked: { id: string; abbreviation: string }[],
): { leagues: FilterLeague[]; allLeaguesLabel?: string } {
	if (tracked.length === 0) return { leagues }
	const trackedIds = new Set(tracked.map((l) => l.id))
	return {
		leagues: leagues.filter((l) => trackedIds.has(l.id)),
		allLeaguesLabel: new Intl.ListFormat("en", {
			type: "conjunction",
		}).format(tracked.map((l) => l.abbreviation)),
	}
}

// The group's standings, then its streak and sweep highlights.
export const Route = createFileRoute(
	"/_app/_authed/groups/$groupId/_tabs/leaderboard",
)({
	component: RouteComponent,
	validateSearch: leaderboardSearchSchema,
	loaderDeps: ({ search }) => ({
		league: search.league,
		season: search.season,
	}),
	// The board is loaded for whatever scope the URL asks for, so a shared link
	// to a filtered board loads that board directly. The leagues (and their
	// seasons) that turn the URL's slug/year into ids come from _app's router
	// context, narrowed to the ones this group tracks - see
	// lib/leaderboard-filter.ts.
	loader: async ({ context, params, deps }) => {
		const { groupId } = params
		const tracked = await context.queryClient.query(groupLeaguesQuery(groupId))
		const scope = groupLeagueScope(
			context.leagues,
			tracked.group?.trackedLeagues ?? [],
		)
		const filter = resolveLeaderboardFilter(scope.leagues, deps, {
			allLeaguesLabel: scope.allLeaguesLabel,
			allowWeek: true,
		})
		await Promise.all([
			context.queryClient.infiniteQuery(
				groupLeaderboardQuery(
					groupId,
					filter.leagueId,
					filter.season,
					filter.thisWeek,
				),
			),
			context.queryClient.query(groupHighlightsQuery(groupId)),
		])
	},
})

function RouteComponent() {
	const { groupId } = Route.useParams()
	const search = Route.useSearch()
	const navigate = Route.useNavigate()
	const { leagues } = Route.useRouteContext()
	const me = useMe()
	const { data: trackedData } = useSuspenseQuery(groupLeaguesQuery(groupId))
	const { data: shell } = useSuspenseQuery(groupShellQuery(groupId))
	const scope = groupLeagueScope(
		leagues,
		trackedData.group?.trackedLeagues ?? [],
	)
	const filter = resolveLeaderboardFilter(scope.leagues, search, {
		allLeaguesLabel: scope.allLeaguesLabel,
		allowWeek: true,
	})
	const group = shell.group
	// The layout already shows the not-found state for a missing group.
	if (!group) return null

	return (
		<VStack alignItems="stretch" gap="6">
			<GroupLeaderboard
				groupId={group.id}
				leagues={scope.leagues}
				filter={filter}
				// A filter swaps the board in place, so the page stays where
				// the reader is rather than jumping back above the header.
				onFilterChange={(next) =>
					navigate({ search: next, resetScroll: false })
				}
				viewerId={me?.id}
			/>
			<GroupHighlights groupId={group.id} />
		</VStack>
	)
}
