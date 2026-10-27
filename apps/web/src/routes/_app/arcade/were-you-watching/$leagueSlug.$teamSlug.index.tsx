import { possessive, teamNickname } from "@called-my-shot/schemas"
import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, notFound } from "@tanstack/react-router"
import { useEffect } from "react"
import { FaRegTimesCircle } from "react-icons/fa"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { z } from "zod"
import { WatchBoard } from "#/components/arcade/were-you-watching/watch-board"
import { watchGameDay } from "#/components/arcade/were-you-watching/watch-codes"
import { WatchQuizGame } from "#/components/arcade/were-you-watching/watch-quiz-game"
import { WatchResetBar } from "#/components/arcade/were-you-watching/watch-reset-bar"
import { WatchStalePanel } from "#/components/arcade/were-you-watching/watch-stale-panel"
import { NotFound } from "#/components/ui/not-found"
import { watchTeamQuizQuery } from "#/graphql/were-you-watching/queries"
import { useMe } from "#/hooks/use-me"
import { pageMeta } from "#/lib/meta"
import { rememberArcadeInvite } from "#/stores/arcade-invite-store"

// A team's quiz on its latest game: the link a subreddit or a Discord drops
// in its postgame thread. Playable signed out. A shared link can carry the
// sharer's group invite (?invite=CODE), offered once the run is over.
export const Route = createFileRoute(
	"/_app/arcade/were-you-watching/$leagueSlug/$teamSlug/",
)({
	component: RouteComponent,
	notFoundComponent: TeamNotFound,
	staticData: { focus: true },
	staleTime: 0,
	validateSearch: z.object({
		invite: z.string().optional().catch(undefined),
	}),
	loader: async ({ context, params }) => {
		const data = await context.queryClient.query(
			watchTeamQuizQuery(params.leagueSlug, params.teamSlug),
		)
		const entry = data.watchTeamQuiz
		if (!entry) throw notFound()
		return {
			team: entry.team.name,
			league: entry.league.abbreviation,
			quiz: entry.quiz
				? {
						code: entry.quiz.code,
						opponent: entry.quiz.opponent.name,
						day: watchGameDay(entry.quiz.gameStartsAt),
						questionCount: entry.quiz.questionCount,
						live: entry.status === "LIVE",
					}
				: null,
		}
	},
	// The current game on the preview, keyed by the quiz so a link pasted
	// after an earlier game re-scrapes once a newer one replaces it.
	head: ({ loaderData, params }) => {
		if (!loaderData) return {}
		const team = teamNickname(loaderData.team)
		const quiz = loaderData.quiz
		const path = `/arcade/were-you-watching/${params.leagueSlug}/${params.teamSlug}`
		return pageMeta({
			title: `Were You Watching? ${team} · Called My Shot`,
			description: quiz?.live
				? `${quiz.questionCount} questions on the ${possessive(team)} ${quiz.day} game against the ${teamNickname(quiz.opponent)}. Four choices, 10 seconds each. Were you watching?`
				: `A quiz on the ${possessive(team)} last game, straight from the box score. Back when the season starts.`,
			path,
			image: quiz
				? {
						path: `/share/were-you-watching/${params.leagueSlug}/${params.teamSlug}/card.png?v=${quiz.code}`,
						alt: `Were You Watching? ${team} vs ${teamNickname(quiz.opponent)}, ${quiz.day}`,
					}
				: undefined,
		})
	},
})

function TeamNotFound() {
	return (
		<NotFound
			icon={<FaRegTimesCircle size={24} />}
			eyebrowText="Were You Watching?"
			heading="This team doesn't exist"
			subtitle="Double check the link, or pick a team from the list."
			link={{ text: "Pick a team", url: "/arcade/were-you-watching" }}
		/>
	)
}

function RouteComponent() {
	const me = useMe()
	const { leagueSlug, teamSlug } = Route.useParams()
	const { invite } = Route.useSearch()
	const { data } = useSuspenseQuery(watchTeamQuizQuery(leagueSlug, teamSlug))
	const entry = data.watchTeamQuiz

	useEffect(() => {
		if (invite) rememberArcadeInvite(invite)
	}, [invite])

	if (!entry) return <TeamNotFound />
	const quiz = entry.quiz

	return (
		<VStack
			gap="8"
			alignItems="stretch"
			className={css({ maxWidth: "2xl", width: "full", marginInline: "auto" })}
		>
			<div>
				{me?.isAdmin && quiz && <WatchResetBar quizId={quiz.id} />}
				{quiz && entry.status === "LIVE" ? (
					<WatchQuizGame
						key={quiz.id}
						quiz={quiz}
						viewerPlay={quiz.viewerPlay ?? null}
						leagueSlug={leagueSlug}
						teamSlug={teamSlug}
					/>
				) : (
					<WatchStalePanel teamName={entry.team.name} hasQuiz={!!quiz} />
				)}
			</div>
			{quiz && (
				<WatchBoard
					rows={quiz.board}
					total={quiz.questionCount}
					playerCount={quiz.playerCount}
				/>
			)}
		</VStack>
	)
}
