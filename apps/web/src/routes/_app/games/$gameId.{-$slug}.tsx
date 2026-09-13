import {
	keepPreviousData,
	useInfiniteQuery,
	useSuspenseQuery,
} from "@tanstack/react-query"
import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import { useState } from "react"
import { FaRegTimesCircle } from "react-icons/fa"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { GameMatchupHeader } from "#/components/games/game-matchup-header"
import { GameWinnerCard } from "#/components/games/game-winner-card"
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
	QuestionShape,
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
import { pageMeta } from "#/lib/meta"
import { buildGameSlug } from "#/lib/slug"

type GameTab = "official" | "community"

type GameData = NonNullable<GameByIdQuery["game"]>

const SORTS: { value: QuestionSortOrder; label: string }[] = [
	{ value: "MOST_CALLED", label: "Most Called" },
	{ value: "NEW", label: "New" },
]

const PAGE_SIZE = 15

// A game's official questions always fit on one page - the who-wins question
// plus one catalog's worth (apps/api/src/db/catalog/game-question-catalog.ts)
// is well under this.
const OFFICIAL_LIMIT = 50

// How official questions read below the who-wins card: team guesses, then
// head-to-heads, then player lines, then who leads the game. Anything else
// official (an admin's own question on the game) follows them. Within a shape,
// oldest first, which is the order the catalog posts them in.
const OFFICIAL_SHAPE_ORDER: QuestionShape[] = [
	"TEAM_STAT_NUMERIC_GUESS",
	"PLAYER_VS_PLAYER",
	"PLAYER_STAT_OVER_UNDER",
	"PLAYER_GAME_STAT_LEADER",
]

function officialRank(shape: QuestionShape): number {
	const index = OFFICIAL_SHAPE_ORDER.indexOf(shape)
	return index === -1 ? OFFICIAL_SHAPE_ORDER.length : index
}

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
	staleTime: 0,
	// Official is the default and stays off the url, so a shared game link
	// always opens on it.
	validateSearch: (search: Record<string, unknown>): { tab?: "community" } => ({
		tab: search.tab === "community" ? "community" : undefined,
	}),
	loaderDeps: ({ search }) => ({ tab: search.tab ?? "official" }),
	// head() can only read loaderData, so the meta-tag fields come back from
	// here; the component reads the same cache entries via its own hooks.
	loader: async ({ context, params, deps }) => {
		const [gameData] = await Promise.all([
			context.queryClient.query(gameQuery(params.gameId)),
			deps.tab === "community"
				? context.queryClient.infiniteQuery(
						communityQuestionsQuery(params.gameId, "MOST_CALLED"),
					)
				: context.queryClient.query(officialQuestionsQuery(params.gameId)),
		])

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
		return pageMeta({
			title: `${game.awayTeam.name} @ ${game.homeTeam.name} · Called My Shot`,
			description: `Call the questions on ${game.awayTeam.name} @ ${game.homeTeam.name} - the winner, the total, and the player lines.`,
			path: `/games/${game.id}/${buildGameSlug(game)}`,
		})
	},
})

function RouteComponent() {
	const { gameId } = Route.useParams()
	const { tab: tabParam } = Route.useSearch()
	const tab: GameTab = tabParam ?? "official"
	const navigate = Route.useNavigate()

	const { data: gameData } = useSuspenseQuery(gameQuery(gameId))
	const game = gameData.game

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

			<GameMatchupHeader game={game} starters={game} />

			<Tabs value={tab} onValueChange={selectTab}>
				<Tabs.List>
					<Tabs.Trigger value="official">Official</Tabs.Trigger>
					<Tabs.Trigger value="community">Community</Tabs.Trigger>
				</Tabs.List>
			</Tabs>

			{tab === "official" ? (
				<OfficialQuestions game={game} />
			) : (
				<CommunityQuestions gameId={game.id} />
			)}
		</VStack>
	)
}

function OfficialQuestions({ game }: { game: GameData }) {
	const { data } = useSuspenseQuery(officialQuestionsQuery(game.id))
	const questions = data.questions.items

	// The "who will win?" question synced onto this game by syncGameQuestions
	// (see apps/api/src/db/sync/sync-game-questions.ts) - surfaced prominently
	// above the rest when it exists, absent entirely otherwise (a game outside
	// the sync window, or before the daily sync has run) rather than showing a
	// placeholder that implies something's broken.
	const hero = questions.find((q) => q.shape === "TEAM_VS_TEAM")
	const rest = questions
		.filter((q) => q.id !== hero?.id)
		.sort(
			(a, b) =>
				officialRank(a.shape) - officialRank(b.shape) ||
				new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
		)

	// Catalog questions only go up inside generate-game-questions.ts's window,
	// so a game further out has just its who-wins question until then.
	const postsLater = game.status === "SCHEDULED" && rest.length === 0
	const postsLaterNote =
		game.league.windowType === "WEEK"
			? "More official questions go up once this game's week is next on the schedule."
			: "More official questions go up about a day before the game."

	return (
		<VStack gap="6" alignItems="stretch">
			{hero && (
				<VStack gap="2" alignItems="stretch">
					<span
						className={css({
							fontFamily: "mono",
							fontSize: "2xs",
							letterSpacing: "wide",
							color: "fg.subtle",
							textTransform: "uppercase",
						})}
					>
						Game winner
					</span>
					<GameWinnerCard question={hero} />
				</VStack>
			)}

			{rest.length > 0 && (
				<VStack gap="3" alignItems="stretch">
					{rest.map((question) => (
						<QuestionCard key={question.id} question={question} />
					))}
				</VStack>
			)}

			{postsLater ? (
				<EmptyState>{postsLaterNote}</EmptyState>
			) : (
				!hero &&
				rest.length === 0 && (
					<EmptyState>No official questions on this game.</EmptyState>
				)
			)}
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
				renderItem={(question) => <QuestionCard question={question} />}
			/>
		</VStack>
	)
}
