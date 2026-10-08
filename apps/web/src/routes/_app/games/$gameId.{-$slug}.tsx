import {
	keepPreviousData,
	useInfiniteQuery,
	useSuspenseQuery,
} from "@tanstack/react-query"
import {
	createFileRoute,
	Link,
	redirect,
	useRouteContext,
} from "@tanstack/react-router"
import { useState } from "react"
import { FaRegTimesCircle } from "react-icons/fa"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { GameGroupBoards } from "#/components/games/game-group-boards"
import { GameMatchupHeader } from "#/components/games/game-matchup-header"
import {
	canSetGameReminder,
	GameReminderButton,
} from "#/components/games/game-reminder-button"
import { GameSetRail } from "#/components/games/game-set-rail"
import { buildGameTweet, GameShareRow } from "#/components/games/game-share-row"
import { QuestionCard } from "#/components/questions/question-card"
import { SortSwitcher } from "#/components/questions/sort-switcher"
import { Breadcrumb } from "#/components/ui/breadcrumb"
import { button } from "#/components/ui/button"
import { EmptyState } from "#/components/ui/empty-state"
import { InfiniteScroll } from "#/components/ui/infinite-scroll"
import { NotFound } from "#/components/ui/not-found"
import { Tabs } from "#/components/ui/tabs"
import type {
	GameByIdQuery,
	GameQuestionsQuery,
	QuestionSortOrder,
} from "#/graphql/generated/graphql"
import {
	GameByIdDocument,
	GameQuestionsDocument,
} from "#/graphql/queries/sports"
import {
	gqlInfiniteQueryOptions,
	gqlQueryOptions,
} from "#/graphql/query-options"
import { formatRecord, formatSignedPoints } from "#/lib/ballot-entry"
import { gameEntryPath, viewerGamePicksSummary } from "#/lib/game-entry"
import { IN_PLAY_REFETCH_MS, isGameInPlay } from "#/lib/game-status"
import { pageMeta } from "#/lib/meta"
import {
	findGameWinnerQuestion,
	GAME_WINNER_LABEL,
	sectionOfficialQuestions,
} from "#/lib/official-game-questions"
import {
	postseasonHeading,
	seededName,
	seriesStakesLabel,
} from "#/lib/postseason"
import { buildGameSlug } from "#/lib/slug"

type GameTab = "official" | "community"

type GameData = NonNullable<GameByIdQuery["game"]>

type GameQuestion = GameQuestionsQuery["questions"]["items"][number]

const SORTS: { value: QuestionSortOrder; label: string }[] = [
	{ value: "MOST_CALLED", label: "Most Called" },
	{ value: "NEW", label: "New" },
]

const PAGE_SIZE = 15

// A game's official questions always fit on one page - the who-wins question
// plus one catalog's worth (apps/api/src/db/catalog/game-question-catalog.ts)
// is well under this.
const OFFICIAL_LIMIT = 50

const sectionLabelClass = css({
	fontFamily: "mono",
	fontSize: "2xs",
	letterSpacing: "wide",
	color: "fg.subtle",
	textTransform: "uppercase",
})

const gameQuery = (id: string) => gqlQueryOptions(GameByIdDocument, { id })

const officialQuestionsQuery = (gameId: string) =>
	gqlQueryOptions(GameQuestionsDocument, {
		gameId,
		first: OFFICIAL_LIMIT,
		isOfficial: true,
	})

// sort is part of the key, so switching it starts a fresh list rather than
// appending to the previous ordering.
const communityQuestionsQuery = (gameId: string, sort: QuestionSortOrder) =>
	gqlInfiniteQueryOptions(
		GameQuestionsDocument,
		{ gameId, first: PAGE_SIZE, sort, isOfficial: false },
		(data) => data.questions,
	)

export const Route = createFileRoute("/_app/games/$gameId/{-$slug}")({
	component: RouteComponent,
	// The game's official questions with the viewer's call on each. The shell
	// only shows the rail from xl up; below that the Official tab's picks line
	// stands in for it.
	staticData: { rightRail: <GameRail /> },
	staleTime: 0,
	// Official is the default and stays off the url, so a shared game link
	// always opens on it.
	validateSearch: (search: Record<string, unknown>): { tab?: "community" } => ({
		tab: search.tab === "community" ? "community" : undefined,
	}),
	loaderDeps: ({ search }) => ({ tab: search.tab ?? "official" }),
	// head() can only read loaderData, so the meta-tag fields come back from
	// here; the component reads the same cache entries via its own hooks.
	// Official questions load on either tab, since the Game winner card above
	// the tabs comes from them.
	loader: async ({ context, params, deps }) => {
		const gamePromise = context.queryClient.query(gameQuery(params.gameId))
		await Promise.all([
			gamePromise,
			context.queryClient.query(officialQuestionsQuery(params.gameId)),
			deps.tab === "community"
				? context.queryClient.infiniteQuery(
						communityQuestionsQuery(params.gameId, "MOST_CALLED"),
					)
				: null,
		])
		const gameData = await gamePromise

		// The slug is decorative - the id ahead of it is what identifies the
		// game - so a missing or stale one is corrected here rather than 404ing.
		// 302, deliberately not 301: startsAt is rewritten on every sync pass
		// (a postponed game moves days), so this target genuinely changes, and a
		// browser that cached a 301 would pin visitors to the old date forever.
		// rel=canonical in the head below is what carries the consolidation to
		// crawlers instead.
		const game = gameData.game
		if (game) {
			const slug = buildGameSlug(game)
			if (params.slug !== slug) {
				throw redirect({
					to: "/games/$gameId/{-$slug}",
					params: { gameId: game.id, slug },
					search: deps.tab === "community" ? { tab: "community" } : {},
					statusCode: 302,
				})
			}
		}
		return { game: gameData.game ?? null }
	},
	head: ({ loaderData }) => {
		const game = loaderData?.game
		if (!game) return {}
		const round = game.postseason
			? `${postseasonHeading(game.postseason)}: `
			: ""
		return pageMeta({
			title: `${round}${seededName(game.awayTeam.name, game.postseason?.awaySeed)} @ ${seededName(game.homeTeam.name, game.postseason?.homeSeed)} · Called My Shot`,
			description: [
				seriesLead(game),
				`Call the questions on ${game.awayTeam.name} @ ${game.homeTeam.name} - the winner, the total, and the player lines.`,
			]
				.filter(Boolean)
				.join(" "),
			path: `/games/${game.id}/${buildGameSlug(game)}`,
		})
	},
})

// "Game 5, winner take all. Series tied 2-2." ahead of a series game's meta
// description, so a shared link says what's riding on it. Null outside a
// series.
function seriesLead(game: {
	status: string
	postseason?: {
		gameNumber: number | null
		ifNecessary: boolean
		summary: string | null
		clinchTeamIds: string[]
	} | null
}): string | null {
	const postseason = game.postseason
	if (!postseason?.gameNumber) return null
	const stakes =
		game.status !== "FINAL" && !postseason.ifNecessary
			? seriesStakesLabel(postseason)
			: null
	const qualifier = stakes
		? stakes.toLowerCase()
		: postseason.ifNecessary
			? "if necessary"
			: null
	const first = qualifier
		? `Game ${postseason.gameNumber}, ${qualifier}.`
		: `Game ${postseason.gameNumber}.`
	return postseason.summary ? `${first} ${postseason.summary}.` : first
}

function RouteComponent() {
	const { gameId } = Route.useParams()
	const { tab: tabParam } = Route.useSearch()
	const tab: GameTab = tabParam ?? "official"
	const navigate = Route.useNavigate()

	const { data: gameData } = useSuspenseQuery({
		...gameQuery(gameId),
		refetchInterval: (query) => {
			const game = query.state.data?.game
			return game && isGameInPlay(game) ? IN_PLAY_REFETCH_MS : false
		},
	})
	const { data: officialData } = useSuspenseQuery({
		...officialQuestionsQuery(gameId),
		refetchInterval:
			gameData.game && isGameInPlay(gameData.game) ? IN_PLAY_REFETCH_MS : false,
	})
	const { me } = useRouteContext({ from: "__root__" })
	const game = gameData.game
	const officialQuestions = officialData.questions.items

	if (!game) {
		return (
			<NotFound
				icon={<FaRegTimesCircle size={24} />}
				eyebrowText="Game"
				heading="This game doesn't exist"
				subtitle="It may have been removed, or the link's just wrong."
				link={{ text: "Back home", url: "/home" }}
			/>
		)
	}

	// The headline call, shown above the tabs so neither one hides it. Absent
	// entirely when the game has none (before the daily sync has run) rather
	// than showing a placeholder that implies something's broken.
	const hero = findGameWinnerQuestion(officialQuestions)

	const matchup = `${game.awayTeam.abbreviation} @ ${game.homeTeam.abbreviation}`
	const picks = viewerGamePicksSummary(officialQuestions)

	function selectTab(next: GameTab) {
		navigate({
			search: next === "community" ? { tab: "community" } : {},
			replace: true,
			resetScroll: false,
		})
	}

	return (
		<VStack gap="6" alignItems="stretch" className={css({ maxWidth: "2xl" })}>
			<Breadcrumb>
				{/* The Games tab on this game's own day/week, not today's. */}
				<Breadcrumb.Link
					to="/leagues/$leagueSlug/games"
					params={{ leagueSlug: game.league.slug }}
					search={{ windowKey: game.windowKey }}
				>
					{game.league.abbreviation}
				</Breadcrumb.Link>
				<Breadcrumb.Current>
					{game.awayTeam.abbreviation} @ {game.homeTeam.abbreviation}
				</Breadcrumb.Current>
			</Breadcrumb>

			<VStack gap="2" alignItems="stretch">
				<GameMatchupHeader game={game} starters={game} />
				{canSetGameReminder(game) && (
					<HStack justify="flex-end">
						<GameReminderButton
							gameId={game.id}
							hasReminder={game.viewerHasReminder}
						/>
					</HStack>
				)}
			</VStack>

			{/* The rail carries this from xl up; below that the rail is hidden,
			    and a phone beside the TV is where it matters most. */}
			{game.viewerGroupBoards.length > 0 && (
				<div className={css({ display: { base: "block", xl: "none" } })}>
					<GameGroupBoards gameId={game.id} boards={game.viewerGroupBoards} />
				</div>
			)}

			{hero && (
				<VStack gap="2" alignItems="stretch">
					<span className={sectionLabelClass}>{GAME_WINNER_LABEL}</span>
					<QuestionCard question={hero} showGame={false} />
				</VStack>
			)}

			{/* The series' own questions, on every game of the series. They lock
			    when Game 1 starts, so on a later game they show how the calls
			    made before the series stand. */}
			{game.postseason && game.postseason.seriesQuestions.length > 0 && (
				<VStack gap="2" alignItems="stretch">
					<span className={sectionLabelClass}>
						The {game.postseason.roundLabel}
					</span>
					<VStack gap="3" alignItems="stretch">
						{game.postseason.seriesQuestions.map((question) => (
							<QuestionCard
								key={question.id}
								question={question}
								showGame={false}
							/>
						))}
					</VStack>
				</VStack>
			)}

			<Tabs value={tab} onValueChange={selectTab}>
				<Tabs.List>
					<Tabs.Trigger value="official">Official</Tabs.Trigger>
					<Tabs.Trigger value="community">Community</Tabs.Trigger>
				</Tabs.List>
			</Tabs>

			{tab === "official" ? (
				<VStack gap="6" alignItems="stretch">
					{me && picks.calledCount > 0 && (
						<HStack
							justify="space-between"
							gap="3"
							display={{ base: "flex", xl: "none" }}
						>
							<Link
								to={gameEntryPath(game.id, me.username)}
								className={css({
									fontFamily: "mono",
									fontSize: "2xs",
									letterSpacing: "wide",
									textTransform: "uppercase",
									color: "primary.default",
									textDecoration: "none",
									_hover: { opacity: 0.8 },
								})}
							>
								{/* Says what the linked page holds, and so what the icons
								    beside it share: the count until a question settles,
								    the record after, same as buildGameTweet. */}
								{picks.wins + picks.losses === 0
									? `${picks.calledCount} of ${picks.questionCount} called`
									: `${formatRecord(picks.wins, picks.losses)} · ${formatSignedPoints(picks.points)} pts`}{" "}
								· See your picks →
							</Link>
							<GameShareRow
								gameId={game.id}
								username={me.username}
								shareTitle={`@${me.username}'s ${matchup} picks`}
								surface="game_page"
								layout="icons"
								tweetText={buildGameTweet({ matchup, ...picks, isOwn: true })}
							/>
						</HStack>
					)}
					<OfficialQuestions
						game={game}
						questions={officialQuestions.filter((q) => q.id !== hero?.id)}
					/>
				</VStack>
			) : (
				<CommunityQuestions gameId={game.id} />
			)}
		</VStack>
	)
}

// Reads the cache entries RouteComponent loads and polls, so the rail moves
// with the page rather than fetching on its own.
function GameRail() {
	const { gameId } = Route.useParams()
	const { data: gameData } = useSuspenseQuery(gameQuery(gameId))
	const { data: officialData } = useSuspenseQuery(
		officialQuestionsQuery(gameId),
	)
	const { me } = useRouteContext({ from: "__root__" })
	if (!gameData.game) return null
	return (
		<VStack gap="6" alignItems="stretch">
			<GameSetRail
				game={gameData.game}
				questions={officialData.questions.items}
				communityQuestions={gameData.game.viewerCommunityQuestions}
				username={me?.username ?? null}
			/>
			<GameGroupBoards
				gameId={gameData.game.id}
				boards={gameData.game.viewerGroupBoards}
			/>
		</VStack>
	)
}

function OfficialQuestions({
	game,
	questions,
}: {
	game: GameData
	questions: GameQuestion[]
}) {
	const sections = sectionOfficialQuestions(questions)

	if (sections.length === 0) {
		// Catalog questions only go up inside generate-game-questions.ts's
		// window, so a game further out has just its who-wins question until
		// then.
		if (game.postseason?.ifNecessary) {
			return (
				<EmptyState>
					This game is only played if the series is still going. Questions go up
					once it is.
				</EmptyState>
			)
		}
		if (game.status === "SCHEDULED" && game.startTimeTbd) {
			return (
				<EmptyState>
					Questions go up once this game has a start time.
				</EmptyState>
			)
		}
		if (game.status === "SCHEDULED") {
			return (
				<EmptyState>
					{game.league.windowType === "WEEK"
						? "More official questions go up once this game's week is next on the schedule."
						: "More official questions go up about a day before the game."}
				</EmptyState>
			)
		}
		return <EmptyState>No other official questions on this game.</EmptyState>
	}

	return (
		<VStack gap="6" alignItems="stretch">
			{sections.map((section) => (
				<VStack key={section.label} gap="2" alignItems="stretch">
					<span className={sectionLabelClass}>{section.label}</span>
					<VStack gap="3" alignItems="stretch">
						{section.questions.map((question) => (
							<QuestionCard
								key={question.id}
								question={question}
								showGame={false}
							/>
						))}
					</VStack>
				</VStack>
			))}
		</VStack>
	)
}

function CommunityQuestions({ gameId }: { gameId: string }) {
	const [sort, setSort] = useState<QuestionSortOrder>("MOST_CALLED")

	// keepPreviousData holds the current ordering on screen while the newly
	// picked sort's first page loads.
	const { data, hasNextPage, isFetching, fetchNextPage } = useInfiniteQuery({
		...communityQuestionsQuery(gameId, sort),
		placeholderData: keepPreviousData,
	})

	return (
		<VStack gap="4" alignItems="stretch">
			<SortSwitcher sorts={SORTS} active={sort} onChange={setSort} />

			<InfiniteScroll
				items={data?.items ?? []}
				getKey={(question) => question.id}
				hasNextPage={hasNextPage}
				loading={isFetching}
				onLoadMore={fetchNextPage}
				emptyState={
					<EmptyState
						action={
							<Link
								to="/new-question"
								className={button({ variant: "solid", size: "sm" })}
							>
								Create a question
							</Link>
						}
					>
						No community questions on this game yet. Why don't you get it
						started?
					</EmptyState>
				}
				renderItem={(question) => (
					<QuestionCard question={question} showGame={false} />
				)}
			/>
		</VStack>
	)
}
