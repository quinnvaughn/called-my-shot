import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { z } from "zod"
import { GameSlotGroup } from "#/components/leagues/game-slot-group"
import { GameWindowStepper } from "#/components/leagues/game-window-stepper"
import { SeriesStrip } from "#/components/leagues/series-strip"
import { ReportCard } from "#/components/report-cards/report-card"
import { EmptyState } from "#/components/ui/empty-state"
import { gqlQueryOptions } from "#/graphql/query-options"
import { leagueQuery } from "#/graphql/sports/leagues/queries"
import {
	LeagueGamesForWindowDocument,
	LeagueGameWindowsDocument,
	LeaguePostseasonSeriesDocument,
} from "#/graphql/sports/schedule/queries"
import { pageMeta } from "#/lib/meta"
import {
	postseasonDescription,
	roundsPhrase,
	windowStakesLine,
} from "#/lib/postseason"

// Stands in for a league with nothing synced yet - no window to step
// through, so the stepper renders its own empty state instead.
const EMPTY_RESULT = {
	window: { key: "", label: "No games scheduled", sublabel: null },
	prevKey: null,
	nextKey: null,
	// No window means no games to have called, so there's nothing to grade.
	viewerReportCard: null,
	groups: [],
}

const gamesForWindowQuery = (leagueId: string, windowKey: string | null) =>
	gqlQueryOptions(LeagueGamesForWindowDocument, { leagueId, windowKey })

const gameWindowsQuery = (leagueId: string) =>
	gqlQueryOptions(LeagueGameWindowsDocument, { leagueId })

const postseasonSeriesQuery = (leagueId: string) =>
	gqlQueryOptions(LeaguePostseasonSeriesDocument, { leagueId })

export const Route = createFileRoute("/_app/leagues/$leagueSlug/games")({
	component: RouteComponent,
	staleTime: 0,
	validateSearch: z.object({
		windowKey: z.string().optional().catch(undefined),
	}),
	loaderDeps: ({ search }) => ({ windowKey: search.windowKey }),
	// Returns the postseason's round labels for head(), which can't read the
	// query cache.
	loader: async ({ context, deps }) => {
		const leagueId = context.league.id
		const [, , seriesData] = await Promise.all([
			context.queryClient.query(
				gamesForWindowQuery(leagueId, deps.windowKey ?? null),
			),
			context.queryClient.query(gameWindowsQuery(leagueId)),
			context.queryClient.query(postseasonSeriesQuery(leagueId)),
		])
		return {
			roundLabels: seriesData.league?.postseason?.roundLabels ?? null,
		}
	},
	// Each tab is its own url in the sitemap, so without this all three
	// inherit the league layout's single title/description and land in Search
	// Console as duplicates of one another.
	head: ({ match, loaderData }) => {
		const league = match.context.league
		const roundLabels = loaderData?.roundLabels ?? null
		return pageMeta({
			title: roundLabels
				? `${league.name} Postseason · Games · Called My Shot`
				: `${league.name} · Games · Called My Shot`,
			description: roundLabels
				? postseasonDescription(league.name, roundLabels)
				: `Every ${league.name} game on the board - call a winner, a total, or a player line on any matchup.`,
			path: `/leagues/${league.slug}/games`,
		})
	},
})

function RouteComponent() {
	const { windowKey } = Route.useSearch()
	const { leagueSlug } = Route.useParams()
	const { league: contextLeague, me } = Route.useRouteContext()
	const { data: windowData } = useSuspenseQuery(
		gamesForWindowQuery(contextLeague.id, windowKey ?? null),
	)
	const { data: windowsData } = useSuspenseQuery(
		gameWindowsQuery(contextLeague.id),
	)
	const { data: leagueData } = useSuspenseQuery(leagueQuery(contextLeague.id))
	const { data: seriesData } = useSuspenseQuery(
		postseasonSeriesQuery(contextLeague.id),
	)
	const result = windowData.leagueGamesForWindow ?? EMPTY_RESULT
	const windows = windowsData.leagueGameWindows
	const league = leagueData.league
	const navigate = Route.useNavigate()

	const hasGames = result.groups.some((group) => group.games.length > 0)
	const postseason = seriesData.league?.postseason ?? null
	const stakesLine = windowStakesLine(result.groups)

	function stepTo(key: string | null) {
		if (!key) return
		navigate({ search: { windowKey: key } })
	}

	// windowKey omitted -> the server's own default (today/this week if it
	// has games, else nearest upcoming, else most recent past - see
	// pickDefaultWindowIndex). Safe to hit even when already there.
	function jumpToDefault() {
		navigate({ search: {} })
	}

	return (
		<VStack gap="4" alignItems="stretch">
			{postseason && postseason.series.length > 0 && (
				<SeriesStrip
					series={postseason.series}
					heading={roundsPhrase(postseason.roundLabels) ?? "Postseason"}
					leagueSlug={leagueSlug}
				/>
			)}

			<HStack justify="flex-end">
				<button
					type="button"
					onClick={jumpToDefault}
					className={css({
						textStyle: "label",
						color: "fg.subtle",
						cursor: "pointer",
						_hover: { color: "fg.default", textDecoration: "underline" },
					})}
				>
					{league?.windowType === "WEEK" ? "Current Week" : "Today"}
				</button>
			</HStack>

			<GameWindowStepper
				windowType={league?.windowType}
				currentWindow={result.window}
				windows={windows}
				prevKey={result.prevKey}
				nextKey={result.nextKey}
				onStep={stepTo}
			/>

			{stakesLine && (
				<span
					className={css({
						textStyle: "label",
						fontWeight: "bold",
						color: "secondary.default",
						textAlign: "center",
					})}
				>
					{stakesLine}
				</span>
			)}

			{/*
			 * Above the slates rather than inside one: this grades the whole
			 * window, while a group's SlateSweepLine below is scoped to its own
			 * slot. Renders nothing signed out, or for a window the viewer has
			 * no calls in.
			 */}
			{result.viewerReportCard && (
				<ReportCard
					card={result.viewerReportCard}
					owner={me && { id: me.id, username: me.username, isOwn: true }}
				/>
			)}

			{!hasGames ? (
				<EmptyState>
					Nothing scheduled. Season questions and ballots are still open in
					their own tabs.
				</EmptyState>
			) : (
				result.groups.map((group, i) => (
					<GameSlotGroup
						key={group.slotLabel ?? i}
						group={group}
						leagueSlug={leagueSlug}
					/>
				))
			)}
		</VStack>
	)
}
