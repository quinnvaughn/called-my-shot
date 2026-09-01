import { useApolloClient } from "@apollo/client/react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
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

const SORTS: { value: QuestionSortOrder; label: string }[] = [
	{ value: "MOST_CALLED", label: "Most Called" },
	{ value: "NEW", label: "New" },
]

export const Route = createFileRoute("/_app/games/$gameId")({
	component: RouteComponent,
	staleTime: 0,
	loader: async ({ context, params }) => {
		const [{ data: gameData }, { data: questionsData }] = await Promise.all([
			context.apolloClient.query({
				query: GameByIdDocument,
				variables: { id: params.gameId },
				fetchPolicy: "network-only",
			}),
			context.apolloClient.query({
				query: GameQuestionsDocument,
				variables: {
					gameId: params.gameId,
					first: PAGE_SIZE,
					after: null,
					sort: "MOST_CALLED",
				},
				fetchPolicy: "network-only",
			}),
		])
		return {
			game: gameData?.game ?? null,
			questions: questionsData?.questions.items ?? [],
			pageInfo: questionsData?.questions.pageInfo ?? {
				hasNextPage: false,
				endCursor: null,
			},
		}
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

const PAGE_SIZE = 15

function RouteComponent() {
	const { gameId } = Route.useParams()
	const {
		game,
		questions: initialQuestions,
		pageInfo: initialPageInfo,
	} = Route.useLoaderData()
	const client = useApolloClient()

	const [sort, setSort] = useState<QuestionSortOrder>("MOST_CALLED")
	const [questions, setQuestions] = useState(initialQuestions)
	const [pageInfo, setPageInfo] = useState(initialPageInfo)
	const [loading, setLoading] = useState(false)
	const skipNextFetch = useRef(true)

	// The "who will win?" question synced onto this game by syncGameQuestions
	// (see apps/api/src/db/sync/sync-game-questions.ts) - surfaced prominently
	// above the rest when it exists, absent entirely otherwise (a game outside
	// the sync window, or before the daily sync has run) rather than showing a
	// placeholder that implies something's broken.
	const hero = questions.find((q) => q.shape === "TEAM_VS_TEAM")
	const rest = questions.filter((q) => q.id !== hero?.id)

	useEffect(() => {
		if (skipNextFetch.current) {
			skipNextFetch.current = false
			return
		}
		let cancelled = false
		setLoading(true)
		client
			.query({
				query: GameQuestionsDocument,
				variables: { gameId, first: PAGE_SIZE, after: null, sort },
				fetchPolicy: "network-only",
			})
			.then(({ data }) => {
				if (cancelled) return
				setQuestions(data?.questions.items ?? [])
				setPageInfo(
					data?.questions.pageInfo ?? { hasNextPage: false, endCursor: null },
				)
			})
			.finally(() => {
				if (!cancelled) setLoading(false)
			})
		return () => {
			cancelled = true
		}
	}, [client, gameId, sort])

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

	async function loadMore() {
		if (loading || !pageInfo.hasNextPage || !pageInfo.endCursor) return
		setLoading(true)
		try {
			const { data } = await client.query({
				query: GameQuestionsDocument,
				variables: {
					gameId,
					first: PAGE_SIZE,
					after: pageInfo.endCursor,
					sort,
				},
				fetchPolicy: "network-only",
			})
			setQuestions((prev) => [...prev, ...(data?.questions.items ?? [])])
			setPageInfo(
				data?.questions.pageInfo ?? { hasNextPage: false, endCursor: null },
			)
		} finally {
			setLoading(false)
		}
	}

	return (
		<VStack gap="6" alignItems="stretch" className={css({ maxWidth: "2xl" })}>
			<Link
				to="/leagues/$leagueId/games"
				params={{ leagueId: game.league.id }}
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
				hasNextPage={pageInfo.hasNextPage}
				loading={loading}
				onLoadMore={loadMore}
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
