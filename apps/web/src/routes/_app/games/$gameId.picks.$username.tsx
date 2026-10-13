import { useQuery, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link, useRouteContext } from "@tanstack/react-router"
import { FaRegTimesCircle } from "react-icons/fa"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { BallotEntrySummaryCard } from "#/components/ballots/ballot-entry-summary-card"
import { EntryCallList } from "#/components/ballots/entry-call-list"
import { GameMatchupHeader } from "#/components/games/game-matchup-header"
import { buildGameTweet, GameShareRow } from "#/components/games/game-share-row"
import { PresserSection } from "#/components/pressers/presser-section"
import { Breadcrumb } from "#/components/ui/breadcrumb"
import { button } from "#/components/ui/button"
import { NotFound } from "#/components/ui/not-found"
import { PageHeader } from "#/components/ui/page-header"
import { GroupCrumbDocument } from "#/graphql/queries/groups"
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

const groupCrumbQuery = (groupId: string) =>
	gqlQueryOptions(GroupCrumbDocument, { groupId })

// Public, like the game page and /ballots/:slug/:username - this url exists
// to be pasted somewhere. Left out of the sitemap for the same reason: one
// person's picks aren't something to index.
export const Route = createFileRoute("/_app/games/$gameId/picks/$username")({
	component: RouteComponent,
	staleTime: 0,
	// Set when the page was opened from a group's board for this game, so the
	// breadcrumb leads back to it. Ignored when the viewer can't see the group.
	validateSearch: (search: Record<string, unknown>): { group?: string } => ({
		group: typeof search.group === "string" ? search.group : undefined,
	}),
	loaderDeps: ({ search }) => ({ group: search.group }),
	loader: async ({ context, params, deps }) => {
		const [data] = await Promise.all([
			context.queryClient.query(gameEntryQuery(params.gameId, params.username)),
			deps.group
				? context.queryClient.query(groupCrumbQuery(deps.group))
				: null,
		])
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
	const { group: groupId } = Route.useSearch()
	const { data: crumbData } = useQuery({
		...groupCrumbQuery(groupId ?? ""),
		enabled: groupId !== undefined,
	})
	const crumbGroup = groupId ? (crumbData?.group ?? null) : null
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
				subtitle={`@${username} hasn't called anything on ${matchup}.`}
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
				{crumbGroup ? (
					<>
						<Breadcrumb.Link
							to="/groups/$groupId"
							params={{ groupId: crumbGroup.id }}
						>
							{crumbGroup.name}
						</Breadcrumb.Link>
						<Breadcrumb.Link
							to="/groups/$groupId/games/$gameId"
							params={{ groupId: crumbGroup.id, gameId: game.id }}
						>
							{matchup}
						</Breadcrumb.Link>
					</>
				) : (
					<>
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
					</>
				)}
				<Breadcrumb.Current>@{entry.user.username}</Breadcrumb.Current>
			</Breadcrumb>

			<PageHeader title={`${entry.user.name}'s picks`} />

			{/* The same matchup the game page opens with, minus starters: the
			    picks only mean something against the game they were made on. */}
			<GameMatchupHeader game={game} />

			<BallotEntrySummaryCard
				person={entry.user}
				calledCount={entry.calledCount}
				memberCount={entry.members.length}
				wins={entry.wins}
				losses={entry.losses}
				points={entry.points}
				isOpen={rows.some((r) => questionDetailState(r.question).canCall)}
				verdict={entry.verdict}
				splits={
					entry.community.calledCount > 0
						? { official: entry.official, community: entry.community }
						: null
				}
				footer={
					<>
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
						{/* Their picks still open to call against, as a ready-made
						    challenge they can trim or add to. */}
						{isOwn &&
							called.some((r) => questionDetailState(r.question).canCall) && (
								<Link
									to="/challenges/new"
									search={{ game: game.id, source: "game_picks" }}
									className={button({ variant: "solid", size: "sm" })}
								>
									Challenge with these picks
								</Link>
							)}
						<GameShareRow
							gameId={game.id}
							username={entry.user.username}
							shareTitle={`@${entry.user.username}'s ${matchup} picks`}
							surface="entry_page"
							layout="icons"
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
					</>
				}
			/>
			{entry.presser && (
				<PresserSection
					presser={entry.presser}
					viewerId={me?.id ?? null}
					viaGroup={groupId !== undefined}
				/>
			)}
			<EntryCallList
				rows={called.flatMap((row) =>
					row.call
						? [{ key: row.question.id, section: row.section, call: row.call }]
						: [],
				)}
				fallbackLabel="Official questions"
				notCalledYet={notCalledYet}
				missed={missed}
			/>
			{/* After the official slate and what's left of it: community
			questions are extra, called on top of the questions everyone got. */}
			{entry.communityMembers.length > 0 && (
				<EntryCallList
					rows={entry.communityMembers.flatMap((m) =>
						m.call ? [{ key: m.question.id, section: null, call: m.call }] : [],
					)}
					fallbackLabel="Community questions"
					notCalledYet={[]}
					missed={[]}
				/>
			)}
		</VStack>
	)
}
