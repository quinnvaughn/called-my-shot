import { useApolloClient } from "@apollo/client/react"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { FaRegTimesCircle } from "react-icons/fa"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { GameBlock } from "#/components/questions/game-block"
import { QuestionCard } from "#/components/questions/question-card"
import { EmptyState } from "#/components/ui/empty-state"
import { InfiniteScroll } from "#/components/ui/infinite-scroll"
import { NotFound } from "#/components/ui/not-found"
import {
	GameByIdDocument,
	GameQuestionsDocument,
} from "#/graphql/queries/sports"

export const Route = createFileRoute("/_app/games/$gameId")({
	component: RouteComponent,
	loader: async ({ context, params }) => {
		const [{ data: gameData }, { data: questionsData }] = await Promise.all([
			context.apolloClient.query({
				query: GameByIdDocument,
				variables: { id: params.gameId },
			}),
			context.apolloClient.query({
				query: GameQuestionsDocument,
				variables: { gameId: params.gameId, first: PAGE_SIZE, after: null },
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

	const [questions, setQuestions] = useState(initialQuestions)
	const [pageInfo, setPageInfo] = useState(initialPageInfo)
	const [loading, setLoading] = useState(false)

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
	// (see apps/api/src/db/sync/sync-game-questions.ts) - surfaced prominently
	// above the rest when it exists, absent entirely otherwise (a game outside
	// the sync window, or before the daily sync has run) rather than showing a
	// placeholder that implies something's broken.
	const hero = questions.find((q) => q.shape === "TEAM_VS_TEAM")
	const rest = questions.filter((q) => q.id !== hero?.id)

	async function loadMore() {
		if (loading || !pageInfo.hasNextPage || !pageInfo.endCursor) return
		setLoading(true)
		try {
			const { data } = await client.query({
				query: GameQuestionsDocument,
				variables: { gameId, first: PAGE_SIZE, after: pageInfo.endCursor },
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
		<VStack gap="6" alignItems="stretch">
			<GameBlock game={game} />

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
					<QuestionCard question={hero} />
				</VStack>
			)}

			<InfiniteScroll
				items={rest}
				getKey={(question) => question.id}
				hasNextPage={pageInfo.hasNextPage}
				loading={loading}
				onLoadMore={loadMore}
				emptyState={
					<EmptyState>
						No other questions on this game yet. They're usually written closer
						to first pitch.
					</EmptyState>
				}
				renderItem={(question) => <QuestionCard question={question} />}
			/>
		</VStack>
	)
}
