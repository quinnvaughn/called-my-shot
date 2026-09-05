import {
	keepPreviousData,
	useInfiniteQuery,
	useSuspenseQuery,
} from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"
import { FaRegTimesCircle } from "react-icons/fa"
import { FiChevronLeft } from "react-icons/fi"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { GameMatchupHeader } from "#/components/games/game-matchup-header"
import { GameWinnerCard } from "#/components/games/game-winner-card"
import { QuestionCard } from "#/components/questions/question-card"
import { SortSwitcher } from "#/components/questions/sort-switcher"
import { button } from "#/components/ui/button"
import { EmptyState } from "#/components/ui/empty-state"
import { InfiniteScroll } from "#/components/ui/infinite-scroll"
import { NotFound } from "#/components/ui/not-found"
import type { QuestionSortOrder } from "#/graphql/generated/graphql"
import {
	GameByIdDocument,
	GameQuestionsDocument,
} from "#/graphql/queries/sports"
import {
	gqlInfiniteQueryOptions,
	gqlQueryOptions,
} from "#/graphql/query-options"

const SORTS: { value: QuestionSortOrder; label: string }[] = [
	{ value: "MOST_CALLED", label: "Most Called" },
	{ value: "NEW", label: "New" },
]

const PAGE_SIZE = 15

const gameQuery = (id: string) => gqlQueryOptions(GameByIdDocument, { id })

// sort is part of the key, so switching it starts a fresh list rather than
// appending to the previous ordering.
const gameQuestionsQuery = (gameId: string, sort: QuestionSortOrder) =>
	gqlInfiniteQueryOptions(
		GameQuestionsDocument,
		{ gameId, first: PAGE_SIZE, sort },
		(data) => data.questions,
	)

export const Route = createFileRoute("/_app/games/$gameId")({
	component: RouteComponent,
	staleTime: 0,
	// head() can only read loaderData, so the meta-tag fields come back from
	// here; the component reads the same cache entries via its own hooks.
	loader: async ({ context, params }) => {
		const [gameData] = await Promise.all([
			context.queryClient.query(gameQuery(params.gameId)),
			context.queryClient.infiniteQuery(
				gameQuestionsQuery(params.gameId, "MOST_CALLED"),
			),
		])
		return { game: gameData.game ?? null }
	},
	head: ({ loaderData }) => {
		const game = loaderData?.game
		if (!game) return {}
		const title = `${game.awayTeam.name} @ ${game.homeTeam.name} · Called My Shot`
		const description = `Call the questions on ${game.awayTeam.name} @ ${game.homeTeam.name}.`
		return {
			meta: [
				{ title },
				{ name: "description", content: description },
				{ property: "og:title", content: title },
				{ property: "og:description", content: description },
			],
		}
	},
})

function RouteComponent() {
	const { gameId } = Route.useParams()
	const [sort, setSort] = useState<QuestionSortOrder>("MOST_CALLED")

	const { data: gameData } = useSuspenseQuery(gameQuery(gameId))
	const game = gameData.game
	// keepPreviousData holds the current ordering on screen while the newly
	// picked sort's first page loads.
	const { data, hasNextPage, isFetching, fetchNextPage } = useInfiniteQuery({
		...gameQuestionsQuery(gameId, sort),
		placeholderData: keepPreviousData,
	})
	const questions = data?.items ?? []

	// The "who will win?" question synced onto this game by syncGameQuestions
	// (see apps/api/src/db/sync/sync-game-questions.ts) - surfaced prominently
	// above the rest when it exists, absent entirely otherwise (a game outside
	// the sync window, or before the daily sync has run) rather than showing a
	// placeholder that implies something's broken.
	const hero = questions.find((q) => q.shape === "TEAM_VS_TEAM")
	const rest = questions.filter((q) => q.id !== hero?.id)

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

	return (
		<VStack gap="6" alignItems="stretch" className={css({ maxWidth: "2xl" })}>
			<Link
				to="/leagues/$leagueSlug/games"
				params={{ leagueSlug: game.league.slug }}
				search={{ windowKey: game.windowKey }}
				className={css({
					display: "inline-flex",
					alignItems: "center",
					gap: "1.5",
					fontFamily: "mono",
					fontSize: "2xs",
					letterSpacing: "wide",
					textTransform: "uppercase",
					color: "fg.subtle",
					_hover: { color: "fg.default" },
				})}
			>
				<FiChevronLeft size={11} />
				{game.league.abbreviation} · Games
			</Link>

			<GameMatchupHeader game={game} />

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

			<SortSwitcher sorts={SORTS} active={sort} onChange={setSort} />

			<InfiniteScroll
				items={rest}
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
						No other questions on this game yet. Why don't you get it started?
					</EmptyState>
				}
				renderItem={(question) => <QuestionCard question={question} />}
			/>
		</VStack>
	)
}
