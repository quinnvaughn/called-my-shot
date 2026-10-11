import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { FiChevronLeft, FiChevronRight } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { GameDayPicker } from "#/components/leagues/game-day-picker"
import { GameRow } from "#/components/leagues/game-row"
import { SeriesStrip } from "#/components/leagues/series-strip"
import { SlateSweepLine } from "#/components/leagues/slate-sweep-line"
import { ReportCard } from "#/components/report-cards/report-card"
import { EmptyState } from "#/components/ui/empty-state"
import { Select } from "#/components/ui/select"
import {
	LeagueGamesForWindowDocument,
	LeagueGameWindowsDocument,
	LeaguePostseasonSeriesDocument,
	leagueQuery,
} from "#/graphql/queries/sports"
import { gqlQueryOptions } from "#/graphql/query-options"
import { pageMeta } from "#/lib/meta"
import {
	eliminationGamesLabel,
	postseasonDescription,
	roundsPhrase,
	seriesStakesLabel,
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
	validateSearch: (
		search: Record<string, unknown>,
	): { windowKey?: string } => ({
		windowKey:
			typeof search.windowKey === "string" ? search.windowKey : undefined,
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
						fontFamily: "mono",
						fontSize: "2xs",
						letterSpacing: "wide",
						textTransform: "uppercase",
						color: "fg.subtle",
						cursor: "pointer",
						_hover: { color: "fg.default", textDecoration: "underline" },
					})}
				>
					{league?.windowType === "WEEK" ? "Current Week" : "Today"}
				</button>
			</HStack>

			<HStack gap="2" alignItems="flex-start">
				<button
					type="button"
					aria-label="Previous"
					disabled={!result.prevKey}
					onClick={() => stepTo(result.prevKey)}
					className={css({
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						width: "10",
						height: "10",
						flexShrink: 0,
						borderRadius: "lg",
						border: "1px solid {colors.border.default}",
						color: "fg.subtle",
						cursor: "pointer",
						_disabled: { opacity: 0.3, cursor: "default" },
						_hover: { color: "fg.default", borderColor: "border.emphasized" },
					})}
				>
					<FiChevronLeft />
				</button>

				<VStack gap="1.5" flex="1" minWidth="0" alignItems="stretch">
					{league?.windowType === "WEEK" ? (
						<Select value={result.window.key} onValueChange={stepTo}>
							<Select.Trigger
								className={css({ "& > span": { textAlign: "center" } })}
							>
								{result.window.label}
							</Select.Trigger>
							<Select.Content>
								{windows.map((w) => (
									<Select.Option key={w.key} value={w.key}>
										{w.label}
									</Select.Option>
								))}
							</Select.Content>
						</Select>
					) : (
						<GameDayPicker
							windows={windows}
							selectedKey={result.window.key}
							label={result.window.label}
							onSelect={stepTo}
						/>
					)}
					{result.window.sublabel && (
						<span
							className={css({
								fontFamily: "mono",
								fontSize: "2xs",
								color: "fg.subtle",
								textAlign: "center",
							})}
						>
							{result.window.sublabel}
						</span>
					)}
				</VStack>

				<button
					type="button"
					aria-label="Next"
					disabled={!result.nextKey}
					onClick={() => stepTo(result.nextKey)}
					className={css({
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						width: "10",
						height: "10",
						flexShrink: 0,
						borderRadius: "lg",
						border: "1px solid {colors.border.default}",
						color: "fg.subtle",
						cursor: "pointer",
						_disabled: { opacity: 0.3, cursor: "default" },
						_hover: { color: "fg.default", borderColor: "border.emphasized" },
					})}
				>
					<FiChevronRight />
				</button>
			</HStack>

			{stakesLine && (
				<span
					className={css({
						fontFamily: "mono",
						fontSize: "2xs",
						letterSpacing: "wide",
						textTransform: "uppercase",
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
					<VStack key={group.slotLabel ?? i} gap="2" alignItems="stretch">
						{group.slotLabel && (
							<HStack gap="2.5" alignItems="center">
								<span
									className={css({
										fontFamily: "mono",
										fontSize: "2xs",
										letterSpacing: "wide",
										color: "fg.muted",
										whiteSpace: "nowrap",
									})}
								>
									{group.slotLabel}
								</span>
								<span
									className={css({
										flex: 1,
										height: "1px",
										bg: "border.default",
									})}
								/>
							</HStack>
						)}
						{group.viewerSweep && (
							<SlateSweepLine
								progress={group.viewerSweep}
								leagueSlug={leagueSlug}
							/>
						)}
						{group.games.map((game) => (
							<GameRow key={game.id} game={game} leagueSlug={leagueSlug} />
						))}
					</VStack>
				))
			)}
		</VStack>
	)
}

type StakesGame = {
	status: string
	postseason: { ifNecessary: boolean; clinchTeamIds: string[] } | null
}

// "2 elimination games · 1 winner take all" for the window on screen, counted
// the same way each row decides whether to show its stakes tag. Null when no
// game in the window decides a series.
function windowStakesLine(groups: { games: StakesGame[] }[]): string | null {
	const stakes = groups
		.flatMap((group) => group.games)
		.flatMap((game) =>
			game.postseason && game.status !== "FINAL" && !game.postseason.ifNecessary
				? [game.postseason]
				: [],
		)
		.filter((postseason) => seriesStakesLabel(postseason) !== null)
	if (stakes.length === 0) return null
	const winnerTakeAll = stakes.filter(
		(postseason) => postseason.clinchTeamIds.length >= 2,
	).length
	return [
		eliminationGamesLabel(stakes.length),
		winnerTakeAll > 0 ? `${winnerTakeAll} winner take all` : null,
	]
		.filter(Boolean)
		.join(" · ")
}
