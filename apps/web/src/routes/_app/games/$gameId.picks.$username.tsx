import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link, useRouteContext } from "@tanstack/react-router"
import { Fragment } from "react"
import { FaRegTimesCircle } from "react-icons/fa"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { BallotEntrySummaryCard } from "#/components/ballots/ballot-entry-summary-card"
import { BallotSectionHeading } from "#/components/ballots/ballot-section-heading"
import { BallotUncalledLine } from "#/components/ballots/ballot-uncalled-line"
import { buildGameTweet, GameShareRow } from "#/components/games/game-share-row"
import { PickPositionRow } from "#/components/questions/pick-position-row"
import { Breadcrumb } from "#/components/ui/breadcrumb"
import { Card } from "#/components/ui/card"
import { NotFound } from "#/components/ui/not-found"
import { PageHeader } from "#/components/ui/page-header"
import { Tag } from "#/components/ui/tag"
import { GameEntryDocument } from "#/graphql/queries/sports"
import { gqlQueryOptions } from "#/graphql/query-options"
import { formatRecord, formatSignedPoints } from "#/lib/ballot-entry"
import { gameEntryPath } from "#/lib/game-entry"
import { gameQuestionChipLabels } from "#/lib/game-question-chip-label"
import { pageMeta } from "#/lib/meta"
import { officialQuestionSequence } from "#/lib/official-game-questions"
import { questionDetailState } from "#/lib/question-detail-state"
import { buildGameSlug } from "#/lib/slug"

const gameEntryQuery = (id: string, username: string) =>
	gqlQueryOptions(GameEntryDocument, { id, username })

// Public, like the game page and /ballots/:slug/:username - this url exists
// to be pasted somewhere. Left out of the sitemap for the same reason: one
// person's picks aren't something to index.
export const Route = createFileRoute("/_app/games/$gameId/picks/$username")({
	component: RouteComponent,
	staleTime: 0,
	loader: async ({ context, params }) => {
		const data = await context.queryClient.query(
			gameEntryQuery(params.gameId, params.username),
		)
		return { game: data.game ?? null }
	},
	head: ({ loaderData }) => {
		const game = loaderData?.game
		const entry = game?.entry
		if (!game || !entry) return {}

		const { username } = entry.user
		const outcome =
			entry.wins + entry.losses > 0
				? [
						formatRecord(entry.wins, entry.losses),
						`${formatSignedPoints(entry.points)} pts`,
					]
				: []
		const heading = `@${username}'s ${game.awayTeam.abbreviation} @ ${game.homeTeam.abbreviation} picks · ${game.league.abbreviation}`

		return pageMeta({
			title: heading,
			description: [
				`${entry.calledCount} of ${entry.members.length} called`,
				...outcome,
			].join(" · "),
			path: gameEntryPath(game.id, username),
			image: {
				// Changes whenever a number on the card does, so an unfurl cache
				// holding an older card is handed a url it has never scraped. The
				// proxy route ignores the param.
				path: `/share/games/${game.id}/users/${username}/card.png?v=${entry.calledCount}-${entry.wins}-${entry.losses}-${entry.points}`,
				alt: heading,
			},
		})
	},
})

function RouteComponent() {
	const { gameId, username } = Route.useParams()
	const { data } = useSuspenseQuery(gameEntryQuery(gameId, username))
	const { me } = useRouteContext({ from: "__root__" })
	const game = data.game

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

	const matchup = `${game.awayTeam.abbreviation} @ ${game.homeTeam.abbreviation}`
	const gameParams = { gameId: game.id, slug: buildGameSlug(game) }

	const entry = game.entry
	if (!entry) {
		return (
			<NotFound
				icon={<FaRegTimesCircle size={24} />}
				eyebrowText="Game"
				heading="No picks here"
				subtitle={`@${username} hasn't called any official questions on ${matchup}.`}
				link={{ text: "Back home", url: "/home" }}
			/>
		)
	}

	const isOwn = me?.id === entry.user.id

	// Same order and sections as the game page and GameStrip. Only called
	// questions get a row; the rest are summed up underneath, split by whether
	// they can still be called, so picks shared early aren't a long run of
	// empty rows.
	const callByQuestionId = new Map(
		entry.members.map((m) => [m.question.id, m.call]),
	)
	const sequence = officialQuestionSequence(
		entry.members.map((m) => m.question),
	)
	const chipLabels = gameQuestionChipLabels(sequence.map((e) => e.question))
	const rows = sequence.map(({ section, question }, index) => ({
		section,
		question,
		call: callByQuestionId.get(question.id) ?? null,
		code: chipLabels[index] ?? String(index + 1),
	}))
	const called = rows.filter((r) => r.call !== null)
	const uncalledLabels = (open: boolean) =>
		rows
			.filter(
				(r) =>
					r.call === null && questionDetailState(r.question).canCall === open,
			)
			.map((r) => r.code)
	const notCalledYet = uncalledLabels(true)
	const missed = uncalledLabels(false)

	return (
		<VStack gap="6" alignItems="stretch" className={css({ maxWidth: "2xl" })}>
			<Breadcrumb>
				<Breadcrumb.Link
					to="/leagues/$leagueSlug/games"
					params={{ leagueSlug: game.league.slug }}
					search={{ windowKey: game.windowKey }}
				>
					{game.league.abbreviation}
				</Breadcrumb.Link>
				<Breadcrumb.Link to="/games/$gameId/{-$slug}" params={gameParams}>
					{matchup}
				</Breadcrumb.Link>
				<Breadcrumb.Current>@{entry.user.username}</Breadcrumb.Current>
			</Breadcrumb>

			<VStack gap="2" alignItems="flex-start">
				<Tag>{game.league.abbreviation}</Tag>
				<PageHeader
					title={`${game.awayTeam.name} @ ${game.homeTeam.name}`}
					subtitle={`${entry.user.name}'s picks`}
				/>
			</VStack>

			<BallotEntrySummaryCard
				calledCount={entry.calledCount}
				memberCount={entry.members.length}
				wins={entry.wins}
				losses={entry.losses}
				points={entry.points}
			/>

			<GameShareRow
				gameId={game.id}
				username={entry.user.username}
				shareTitle={`@${entry.user.username}'s ${matchup} picks`}
				surface="entry_page"
				tweetText={buildGameTweet({
					matchup,
					calledCount: entry.calledCount,
					questionCount: entry.members.length,
					wins: entry.wins,
					losses: entry.losses,
					points: entry.points,
					...(isOwn
						? ({ isOwn: true } as const)
						: ({ isOwn: false, username: entry.user.username } as const)),
				})}
			/>

			<VStack gap="3" alignItems="stretch">
				<span
					className={css({
						fontFamily: "mono",
						fontSize: "2xs",
						letterSpacing: "wide",
						color: "fg.subtle",
						textTransform: "uppercase",
					})}
				>
					Official questions
				</span>
				<Card>
					<VStack gap="0" alignItems="stretch">
						{called.map((row, i) => (
							<Fragment key={row.question.id}>
								{row.section !== called[i - 1]?.section && (
									<BallotSectionHeading label={row.section} />
								)}
								{/* The chip label runs longer than a ballot slot, so it
								    takes the row's wrapping label line rather than its
								    bold code line. */}
								<PickPositionRow
									question={row.question}
									call={row.call}
									code={null}
									label={row.code}
								/>
							</Fragment>
						))}
						{notCalledYet.length > 0 && (
							<BallotUncalledLine
								heading="Not called yet"
								labels={notCalledYet}
							/>
						)}
						{missed.length > 0 && (
							<BallotUncalledLine heading="Missed" labels={missed} />
						)}
					</VStack>
				</Card>
			</VStack>

			<Link
				to="/games/$gameId/{-$slug}"
				params={gameParams}
				className={css({
					fontFamily: "mono",
					fontSize: "2xs",
					letterSpacing: "wide",
					textTransform: "uppercase",
					color: "primary.default",
					textDecoration: "none",
					_hover: { opacity: 0.8 },
				})}
			>
				{isOwn ? "Back to the game →" : "Make your own calls →"}
			</Link>
		</VStack>
	)
}
