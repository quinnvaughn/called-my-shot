import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { FaRegTimesCircle } from "react-icons/fa"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { ChallengeCallsCard } from "#/components/challenges/challenge-calls-card"
import { ChallengeHero } from "#/components/challenges/challenge-hero"
import { ChallengeHeroAction } from "#/components/challenges/challenge-hero-action"
import { ChallengeMatchupsCard } from "#/components/challenges/challenge-matchups-card"
import { ChallengeShareRow } from "#/components/challenges/challenge-share-row"
import { CommentCard } from "#/components/comments/comment-card"
import { GameMatchupHeader } from "#/components/games/game-matchup-header"
import { Breadcrumb } from "#/components/ui/breadcrumb"
import { button } from "#/components/ui/button"
import { NotFound } from "#/components/ui/not-found"
import { challengePageQuery } from "#/graphql/challenges/queries"
import { openPointsBySide, singleGameOf } from "#/lib/challenge"
import {
	formatRecord,
	IN_PLAY_REFETCH_MS,
	matchupLabel,
} from "#/lib/game-status"
import { pageMeta } from "#/lib/meta"
import { pluralize } from "#/lib/pluralize"

// Public: the link is the whole point, and most people opening it won't
// have an account yet.
export const Route = createFileRoute("/_app/challenges/$code")({
	component: RouteComponent,
	loader: async ({ context, params }) => {
		const data = await context.queryClient.query(
			challengePageQuery(params.code),
		)
		const challenge = data.challenge
		return {
			meta: challenge
				? {
						creator: challenge.creator.username,
						questionCount: challenge.entries.length,
						state: challenge.state,
						acceptanceCount: challenge.acceptanceCount,
						tally: challenge.creatorTally,
						code: challenge.code,
					}
				: null,
		}
	},
	head: ({ loaderData, params }) => {
		const meta = loaderData?.meta
		if (!meta) return {}
		const questions = `${meta.questionCount} ${pluralize(meta.questionCount, "question")}`
		return pageMeta({
			title:
				meta.state === "OPEN"
					? `Can you beat @${meta.creator}? | Called My Shot`
					: `@${meta.creator}'s challenge on Called My Shot`,
			description: match(meta.state)
				.with(
					"OPEN",
					() =>
						`@${meta.creator} made their calls on ${questions} and dares you to do better. Make yours before the first one locks. Whoever scores more points wins the 1v1.`,
				)
				.with(
					"LIVE",
					() =>
						`${meta.acceptanceCount} took on @${meta.creator} across ${questions}. It's playing out now.`,
				)
				.with("SETTLED", () =>
					meta.acceptanceCount > 0
						? `@${meta.creator} went ${formatRecord(meta.tally.wins, meta.tally.losses, meta.tally.draws || null)} against everyone who took on their ${questions}.`
						: `@${meta.creator}'s challenge on ${questions} is over.`,
				)
				.with(
					"VOIDED",
					() => `Every question in @${meta.creator}'s challenge was voided.`,
				)
				.exhaustive(),
			path: `/challenges/${params.code}`,
			image: {
				path: `/share/challenges/${meta.code}/card.png?v=${meta.state}-${meta.acceptanceCount}`,
				alt: `@${meta.creator}'s challenge`,
			},
		})
	},
})

function RouteComponent() {
	const { code } = Route.useParams()
	// Kept current while its games are being played, so the score moves with
	// them.
	const { data } = useSuspenseQuery({
		...challengePageQuery(code),
		refetchInterval: (query) =>
			query.state.data?.challenge?.state === "LIVE"
				? IN_PLAY_REFETCH_MS
				: false,
	})
	const { me } = Route.useRouteContext()
	const challenge = data.challenge

	if (!challenge) {
		return (
			<NotFound
				icon={<FaRegTimesCircle size={24} />}
				eyebrowText="Challenge"
				heading="This challenge doesn't exist"
				subtitle="Check the link with whoever sent it."
				link={{ text: "Back to home", url: "/" }}
			/>
		)
	}

	const creator = challenge.creator
	const isCreator = me?.id === creator.id
	const viewerMatchup = challenge.viewerMatchup
	const questions = challenge.entries.map((e) => e.question)
	// Points only mean something once a question has a result.
	const settledCount = questions.filter(
		(q) => q.status === "RESOLVED" || q.status === "DISPUTED",
	).length
	// A challenge on one game's card leads with that game, the way the game
	// page does, and its questions don't repeat it.
	const game = singleGameOf(questions)
	const canAccept = challenge.viewerCanAccept && !isCreator

	return (
		<VStack gap="6" alignItems="stretch" className={css({ paddingTop: "6" })}>
			{me && (
				<Breadcrumb>
					<Breadcrumb.Link to="/challenges">Challenges</Breadcrumb.Link>
					<Breadcrumb.Current>
						@{creator.username}'s challenge
					</Breadcrumb.Current>
				</Breadcrumb>
			)}
			<ChallengeHero
				creator={creator}
				isCreator={isCreator}
				matchup={game ? matchupLabel(game) : null}
				state={challenge.state}
				closesAt={challenge.closesAt}
				questionCount={questions.length}
				acceptanceCount={challenge.acceptanceCount}
				tally={challenge.creatorTally}
				viewerHeadToHead={challenge.viewerHeadToHead}
				creatorPoints={
					isCreator && settledCount > 0
						? challenge.entries.reduce(
								(sum, e) => sum + (e.creatorPoints ?? 0),
								0,
							)
						: null
				}
				score={
					viewerMatchup
						? {
								you: viewerMatchup.acceptorPoints,
								them: viewerMatchup.creatorPoints,
								settled: settledCount,
								outcome: viewerMatchup.outcome,
								open: openPointsBySide(challenge.entries, viewerMatchup.rows),
							}
						: null
				}
				action={
					<ChallengeHeroAction
						challenge={challenge}
						isCreator={isCreator}
						canAccept={canAccept}
						gifsEnabled={data.gifsEnabled}
					/>
				}
				share={
					<ChallengeShareRow
						challengeId={challenge.id}
						code={challenge.code}
						creatorUsername={creator.username}
						isCreator={isCreator}
						questionCount={questions.length}
					/>
				}
			/>

			{challenge.creatorGloat && (
				<CommentCard
					comment={challenge.creatorGloat}
					trailing="talked trash"
					reportTitle="Report this trash talk"
				/>
			)}

			{/* The creator's page is their 1v1s: one row each, opening the
			    question-by-question page for it. */}
			{isCreator && (
				<ChallengeMatchupsCard
					code={challenge.code}
					matchups={challenge.matchups}
				/>
			)}

			{game && <GameMatchupHeader game={game} />}

			{viewerMatchup?.acceptorGloat && (
				<CommentCard
					comment={viewerMatchup.acceptorGloat}
					trailing="talked trash"
					reportTitle="Report this trash talk"
				/>
			)}

			<ChallengeCallsCard challenge={challenge} isCreator={isCreator} />

			{canAccept && (
				<Link
					to="/challenges/$code/play"
					params={{ code: challenge.code }}
					className={button({ variant: "solid", size: "lg", fullWidth: true })}
				>
					Take on @{creator.username}
				</Link>
			)}
		</VStack>
	)
}
