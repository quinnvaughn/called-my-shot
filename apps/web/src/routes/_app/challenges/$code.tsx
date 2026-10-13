import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { FaRegTimesCircle } from "react-icons/fa"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { ChallengeHero } from "#/components/challenges/challenge-hero"
import { ChallengeQuestionRow } from "#/components/challenges/challenge-question-row"
import { ChallengeShareRow } from "#/components/challenges/challenge-share-row"
import { MatchupList } from "#/components/challenges/matchup-list"
import { PostChallengeModal } from "#/components/challenges/post-challenge-modal"
import { GameMatchupHeader } from "#/components/games/game-matchup-header"
import { GloatCard } from "#/components/gloats/gloat-card"
import { GloatComposerModal } from "#/components/gloats/gloat-composer-modal"
import { Breadcrumb } from "#/components/ui/breadcrumb"
import { Button, button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { EmptyState } from "#/components/ui/empty-state"
import { Eyebrow } from "#/components/ui/eyebrow"
import { NotFound } from "#/components/ui/not-found"
import { challengePageQuery } from "#/graphql/queries/challenges"
import { singleGameOf } from "#/lib/challenge"
import { pageMeta } from "#/lib/meta"
import { pluralize } from "#/lib/pluralize"
import { openModal } from "#/stores/modal-store"

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
			title: `@${meta.creator}'s challenge on Called My Shot`,
			description: `@${meta.creator} made their calls on ${questions}. Make yours, and whoever scores more points takes the 1v1.`,
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
	const { data } = useSuspenseQuery(challengePageQuery(code))
	const { me } = Route.useRouteContext()
	const challenge = data.challenge

	if (!challenge) {
		return (
			<NotFound
				icon={<FaRegTimesCircle size={24} />}
				eyebrowText="Challenge"
				heading="This challenge doesn't exist"
				subtitle="Check the link with whoever sent it."
				link={{ text: "Back to home", url: "/home" }}
			/>
		)
	}

	const creator = challenge.creator
	const isCreator = me?.id === creator.id
	const viewerMatchup = challenge.viewerMatchup
	const questions = challenge.entries.map((e) => e.question)
	// A challenge on one game's card leads with that game, the way the game
	// page does, and its questions don't repeat it.
	const game = singleGameOf(questions)
	const canAccept = challenge.viewerCanAccept && !isCreator

	const action = canAccept ? (
		<Link
			to="/challenges/$code/play"
			params={{ code: challenge.code }}
			className={button({ variant: "solid", size: "lg", fullWidth: true })}
		>
			Take on @{creator.username}
		</Link>
	) : challenge.viewerCanGloat ? (
		<Button
			variant="solid"
			size="lg"
			fullWidth
			onClick={() =>
				openModal(
					<GloatComposerModal
						challengeId={challenge.id}
						recipients={
							isCreator
								? `the ${challenge.creatorTally.wins} ${pluralize(challenge.creatorTally.wins, "person", "people")} you beat`
								: `@${creator.username}`
						}
					/>,
				)
			}
		>
			{isCreator
				? "Talk trash to everyone you beat"
				: `Talk trash to @${creator.username}`}
		</Button>
	) : isCreator && challenge.state === "OPEN" ? (
		<HStack gap="3" flexWrap="wrap">
			<p className={css({ fontSize: "sm", color: "fg.muted", flex: "1" })}>
				Call every question before it locks. One you don't call counts as 0 for
				you in every 1v1.
			</p>
			<Button
				variant="outline"
				size="sm"
				onClick={() =>
					openModal(<PostChallengeModal challengeId={challenge.id} />)
				}
			>
				Post to a group
			</Button>
		</HStack>
	) : null

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
				state={challenge.state}
				closesAt={challenge.closesAt}
				questionCount={questions.length}
				acceptanceCount={challenge.acceptanceCount}
				tally={challenge.creatorTally}
				viewerHeadToHead={challenge.viewerHeadToHead}
				score={
					viewerMatchup
						? {
								you: viewerMatchup.acceptorPoints,
								them: viewerMatchup.creatorPoints,
								settled: challenge.entries.filter(
									(e) =>
										e.question.status === "RESOLVED" ||
										e.question.status === "DISPUTED",
								).length,
								outcome: viewerMatchup.outcome,
							}
						: null
				}
				action={action}
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

			{challenge.creatorGloat && <GloatCard gloat={challenge.creatorGloat} />}

			{/* The creator's page is their 1v1s: one row each, opening the
			    question-by-question page for it. */}
			{isCreator && (
				<Card size="md">
					<Card.Header>
						<Eyebrow variant="neutral">
							{`Your 1v1s · ${challenge.matchups.length}`}
						</Eyebrow>
					</Card.Header>
					<Card.Body>
						{challenge.matchups.length === 0 ? (
							<EmptyState>
								Nobody's taken it on yet. Anyone you send the link to can.
							</EmptyState>
						) : (
							<MatchupList
								code={challenge.code}
								matchups={challenge.matchups}
							/>
						)}
					</Card.Body>
				</Card>
			)}

			{game && <GameMatchupHeader game={game} />}

			{viewerMatchup?.acceptorGloat && (
				<GloatCard gloat={viewerMatchup.acceptorGloat} />
			)}

			<Card size="md">
				<Card.Header>
					<Eyebrow variant="neutral">
						{isCreator
							? "Your calls"
							: viewerMatchup
								? `Your 1v1 with @${creator.username}`
								: `@${creator.username}'s calls`}
					</Eyebrow>
				</Card.Header>
				<Card.Body className={css({ paddingBlock: "0" })}>
					{challenge.entries.map((entry) => (
						<ChallengeQuestionRow
							key={entry.question.id}
							entry={entry}
							row={
								viewerMatchup?.rows.find(
									(r) => r.question.id === entry.question.id,
								) ?? null
							}
							creatorLabel={isCreator ? "You" : `@${creator.username}`}
							viewerSide={isCreator ? "creator" : "opponent"}
							opponent={
								isCreator
									? null
									: viewerMatchup
										? { label: "You" }
										: entry.question.viewerCall
											? { label: "You", call: entry.question.viewerCall }
											: null
							}
						/>
					))}
				</Card.Body>
			</Card>

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
