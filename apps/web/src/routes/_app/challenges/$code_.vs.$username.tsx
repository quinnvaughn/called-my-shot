import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { FaRegTimesCircle } from "react-icons/fa"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { ChallengeQuestionRow } from "#/components/challenges/challenge-question-row"
import { outcomeLabel } from "#/components/challenges/matchup-list"
import { MatchupScoreboard } from "#/components/challenges/matchup-scoreboard"
import { GameMatchupHeader } from "#/components/games/game-matchup-header"
import { GloatCard } from "#/components/gloats/gloat-card"
import { Breadcrumb } from "#/components/ui/breadcrumb"
import { Card } from "#/components/ui/card"
import { NotFound } from "#/components/ui/not-found"
import { ShareIconRow } from "#/components/ui/share-icon-row"
import { challengeReceiptQuery } from "#/graphql/queries/challenges"
import { track } from "#/lib/analytics"
import { singleGameOf } from "#/lib/challenge"
import { pageMeta, SITE_ORIGIN } from "#/lib/meta"

// One 1v1's receipt: both sides' calls on every question and what each was
// worth. Public, so it can be posted.
export const Route = createFileRoute("/_app/challenges/$code_/vs/$username")({
	component: RouteComponent,
	loader: async ({ context, params }) => {
		const data = await context.queryClient.query(
			challengeReceiptQuery(params.code, params.username),
		)
		const challenge = data.challenge
		const matchup = challenge?.matchup
		return {
			meta:
				challenge && matchup
					? {
							creator: challenge.creator.username,
							acceptor: matchup.acceptor.username,
							outcome: matchup.outcome,
							code: challenge.code,
						}
					: null,
		}
	},
	head: ({ loaderData, params }) => {
		const meta = loaderData?.meta
		if (!meta) return {}
		const title = `@${meta.creator} vs @${meta.acceptor}`
		return pageMeta({
			title: `${title} on Called My Shot`,
			description: meta.outcome
				? `${outcomeLabel(meta.outcome, meta.creator, meta.acceptor)}. Every call and what it was worth.`
				: "Still playing out. Every call and what it's worth so far.",
			path: `/challenges/${params.code}/vs/${params.username}`,
			image: {
				path: `/share/challenges/${meta.code}/vs/${meta.acceptor}/card.png?v=${meta.outcome ?? "live"}`,
				alt: title,
			},
		})
	},
})

const profileLink = css({ _hover: { textDecoration: "underline" } })

function RouteComponent() {
	const { code, username } = Route.useParams()
	const { me } = Route.useRouteContext()
	const { data } = useSuspenseQuery(challengeReceiptQuery(code, username))
	const challenge = data.challenge
	const matchup = challenge?.matchup

	if (!challenge || !matchup) {
		return (
			<NotFound
				icon={<FaRegTimesCircle size={24} />}
				eyebrowText="Challenge"
				heading="There's no 1v1 here"
				subtitle="This person hasn't taken that challenge on."
				link={{ text: "Back to home", url: "/home" }}
			/>
		)
	}

	const creator = challenge.creator.username
	const acceptor = matchup.acceptor.username
	const game = singleGameOf(challenge.entries.map((e) => e.question))
	const viewerSide =
		me?.username === creator
			? "creator"
			: me?.username === acceptor
				? "acceptor"
				: null

	return (
		<VStack gap="6" alignItems="stretch" className={css({ paddingTop: "6" })}>
			<VStack gap="2" alignItems="stretch">
				<Breadcrumb>
					{me && <Breadcrumb.Link to="/challenges">Challenges</Breadcrumb.Link>}
					<Breadcrumb.Link
						to="/challenges/$code"
						params={{ code: challenge.code }}
					>
						@{creator}'s challenge
					</Breadcrumb.Link>
					<Breadcrumb.Current>vs @{acceptor}</Breadcrumb.Current>
				</Breadcrumb>
				<HStack justify="space-between" gap="3" flexWrap="wrap">
					<h1 className={css({ fontSize: "3xl", fontFamily: "heading" })}>
						<Link
							to="/user/$username"
							params={{ username: creator }}
							className={profileLink}
						>
							@{creator}
						</Link>{" "}
						vs{" "}
						<Link
							to="/user/$username"
							params={{ username: acceptor }}
							className={profileLink}
						>
							@{acceptor}
						</Link>
					</h1>
					<ShareIconRow
						url={`${SITE_ORIGIN}/challenges/${challenge.code}/vs/${acceptor}`}
						campaign="challenge_receipt"
						shareTitle={`@${creator} vs @${acceptor}`}
						tweetText={
							matchup.outcome
								? `${outcomeLabel(matchup.outcome, creator, acceptor)}. Here's the receipt:`
								: `@${creator} vs @${acceptor}, still playing out:`
						}
						onShared={(method) =>
							track("challenge_link_shared", {
								challengeId: challenge.id,
								receipt: true,
								method,
							})
						}
					/>
				</HStack>
			</VStack>
			<MatchupScoreboard
				leading={viewerSide ?? "creator"}
				creator={{
					label: viewerSide === "creator" ? "You" : `@${creator}`,
					points: matchup.creatorPoints,
				}}
				acceptor={{
					label: viewerSide === "acceptor" ? "You" : `@${acceptor}`,
					points: matchup.acceptorPoints,
				}}
				outcome={matchup.outcome}
			/>
			{game && <GameMatchupHeader game={game} />}
			{(matchup.creatorGloat || matchup.acceptorGloat) && (
				<VStack
					id="trash-talk"
					gap="3"
					alignItems="stretch"
					className={css({ scrollMarginTop: "20" })}
				>
					{matchup.creatorGloat && <GloatCard gloat={matchup.creatorGloat} />}
					{matchup.acceptorGloat && <GloatCard gloat={matchup.acceptorGloat} />}
				</VStack>
			)}
			<Card size="md">
				<Card.Body className={css({ paddingBlock: "0" })}>
					{challenge.entries.map((entry) => (
						<ChallengeQuestionRow
							key={entry.question.id}
							entry={entry}
							row={
								matchup.rows.find((r) => r.question.id === entry.question.id) ??
								null
							}
							creatorLabel={me?.username === creator ? "You" : `@${creator}`}
							opponent={{
								label: me?.username === acceptor ? "You" : `@${acceptor}`,
							}}
							viewerSide={viewerSide === "acceptor" ? "opponent" : viewerSide}
						/>
					))}
				</Card.Body>
			</Card>
		</VStack>
	)
}
