import { possessive, teamNickname } from "@called-my-shot/schemas"
import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link, notFound } from "@tanstack/react-router"
import { FaRegTimesCircle } from "react-icons/fa"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { WatchBoard } from "#/components/arcade/were-you-watching/watch-board"
import { watchGameDay } from "#/components/arcade/were-you-watching/watch-codes"
import { WatchQuizHeader } from "#/components/arcade/were-you-watching/watch-quiz-header"
import { button } from "#/components/ui/button"
import { NotFound } from "#/components/ui/not-found"
import { watchQuizByCodeQuery } from "#/graphql/were-you-watching/queries"
import { pageMeta } from "#/lib/meta"

// One of a team's quizzes by its game's day: its board, and the way to the
// quiz that's up now.
export const Route = createFileRoute(
	"/_app/arcade/were-you-watching/$leagueSlug/$teamSlug/$code/",
)({
	component: RouteComponent,
	notFoundComponent: QuizNotFound,
	loader: async ({ context, params }) => {
		const data = await context.queryClient.query(
			watchQuizByCodeQuery(params.leagueSlug, params.teamSlug, params.code),
		)
		const quiz = data.watchQuizByCode
		if (!quiz) throw notFound()
		return {
			team: quiz.team.name,
			opponent: quiz.opponent.name,
			day: watchGameDay(quiz.gameStartsAt),
		}
	},
	head: ({ loaderData, params }) => {
		if (!loaderData) return {}
		const team = teamNickname(loaderData.team)
		return pageMeta({
			title: `Were You Watching? ${team}, ${loaderData.day} · Called My Shot`,
			description: `The board for the quiz on the ${possessive(team)} ${loaderData.day} game against the ${teamNickname(loaderData.opponent)}.`,
			path: `/arcade/were-you-watching/${params.leagueSlug}/${params.teamSlug}/${params.code}`,
		})
	},
})

function QuizNotFound() {
	return (
		<NotFound
			icon={<FaRegTimesCircle size={24} />}
			eyebrowText="Were You Watching?"
			heading="This quiz doesn't exist"
			subtitle="Double check the link, or pick a team from the list."
			link={{ text: "Pick a team", url: "/arcade/were-you-watching" }}
		/>
	)
}

function RouteComponent() {
	const { leagueSlug, teamSlug, code } = Route.useParams()
	const { data } = useSuspenseQuery(
		watchQuizByCodeQuery(leagueSlug, teamSlug, code),
	)
	const quiz = data.watchQuizByCode
	if (!quiz) return <QuizNotFound />
	const team = teamNickname(quiz.team.name)

	return (
		<VStack
			gap="6"
			alignItems="stretch"
			className={css({ maxWidth: "2xl", width: "full", marginInline: "auto" })}
		>
			<WatchQuizHeader
				team={quiz.team}
				opponent={quiz.opponent}
				gameStartsAt={quiz.gameStartsAt}
				league={quiz.league.abbreviation}
			/>
			<p className={css({ color: "fg.body" })}>
				{quiz.live
					? `This is the quiz on the ${possessive(team)} latest game, and it's still up.`
					: `This quiz is closed. The ${possessive(team)} quiz is always on their latest game.`}
			</p>
			<Link
				to="/arcade/were-you-watching/$leagueSlug/$teamSlug"
				params={{ leagueSlug, teamSlug }}
				className={button({ variant: "solid", size: "md" })}
			>
				{quiz.live ? "Take the quiz" : `Play the ${possessive(team)} latest`}
			</Link>
			<WatchBoard
				rows={quiz.board}
				total={quiz.questionCount}
				playerCount={quiz.playerCount}
			/>
		</VStack>
	)
}
