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
	GameQuestionsQuery,
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

// The Official tab's sections, in the order they read. Each names the kind of
// call its questions are, so a new catalog template lands in its shape's
// section and a new shape needs a section of its own here. Any other official
// question on the game (an admin's own) goes under More.
const OFFICIAL_SECTIONS: { label: string; shapes: QuestionShape[] }[] = [
	{ label: "Team scores", shapes: ["TEAM_STAT_NUMERIC_GUESS"] },
	{ label: "Head to head", shapes: ["PLAYER_VS_PLAYER"] },
	{ label: "Player lines", shapes: ["PLAYER_STAT_OVER_UNDER"] },
	{ label: "Game leader", shapes: ["PLAYER_GAME_STAT_LEADER"] },
]

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
	const { data: officialData } = useSuspenseQuery(
		officialQuestionsQuery(gameId),
	)
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

	// The "who will win?" question synced onto this game by syncGameQuestions
	// (see apps/api/src/db/sync/sync-game-questions.ts) - the headline call,
	// shown above the tabs so neither one hides it. Absent entirely when the
	// game has none (before the daily sync has run) rather than showing a
	// placeholder that implies something's broken.
	const hero = officialQuestions.find((q) => q.shape === "TEAM_VS_TEAM")

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

			{hero && (
				<VStack gap="2" alignItems="stretch">
					<span className={sectionLabelClass}>Game winner</span>
					<GameWinnerCard question={hero} />
				</VStack>
			)}

			<Tabs value={tab} onValueChange={selectTab}>
				<Tabs.List>
					<Tabs.Trigger value="official">Official</Tabs.Trigger>
					<Tabs.Trigger value="community">Community</Tabs.Trigger>
				</Tabs.List>
			</Tabs>

			{tab === "official" ? (
				<OfficialQuestions
					game={game}
					questions={officialQuestions.filter((q) => q.id !== hero?.id)}
				/>
			) : (
				<CommunityQuestions gameId={game.id} />
			)}
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
	// Oldest first within a section, which is the order the catalog posts them
	// in (away team before home).
	const byAge = (a: GameQuestion, b: GameQuestion) =>
		new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
	const sectioned = new Set(OFFICIAL_SECTIONS.flatMap((s) => s.shapes))
	const sections = [
		...OFFICIAL_SECTIONS.map((section) => ({
			label: section.label,
			questions: questions.filter((q) => section.shapes.includes(q.shape)),
		})),
		{
			label: "More",
			questions: questions.filter((q) => !sectioned.has(q.shape)),
		},
	]
		.map((section) => ({
			...section,
			questions: [...section.questions].sort(byAge),
		}))
		.filter((section) => section.questions.length > 0)

	if (sections.length === 0) {
		// Catalog questions only go up inside generate-game-questions.ts's
		// window, so a game further out has just its who-wins question until
		// then.
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
							<QuestionCard key={question.id} question={question} />
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
				renderItem={(question) => <QuestionCard question={question} />}
			/>
		</VStack>
	)
}
