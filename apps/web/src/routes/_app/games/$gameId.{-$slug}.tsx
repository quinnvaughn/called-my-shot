import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import { FaRegTimesCircle } from "react-icons/fa"
import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { z } from "zod"
import {
	communityQuestionsQuery,
	GameCommunityQuestions,
} from "#/components/games/game-community-questions"
import { GameGroupBoards } from "#/components/games/game-group-boards"
import { GameMatchupHeader } from "#/components/games/game-matchup-header"
import { GameOfficialCard } from "#/components/games/game-official-card"
import { GameOfficialQuestions } from "#/components/games/game-official-questions"
import {
	canSetGameReminder,
	GameReminderButton,
} from "#/components/games/game-reminder-button"
import { GameSetRail } from "#/components/games/game-set-rail"
import { buildGameTweet, GameShareRow } from "#/components/games/game-share-row"
import { QuestionCard } from "#/components/questions/question-card"
import { arrowLink } from "#/components/ui/arrow-link"
import { Breadcrumb } from "#/components/ui/breadcrumb"
import { button } from "#/components/ui/button"
import { CountBadge } from "#/components/ui/count-badge"
import { NotFound } from "#/components/ui/not-found"
import { Tabs } from "#/components/ui/tabs"
import { gqlQueryOptions } from "#/graphql/query-options"
import {
	GameByIdDocument,
	GameOfficialQuestionsDocument,
} from "#/graphql/sports/games/queries"
import { useMe } from "#/hooks/use-me"
import { formatSigned } from "#/lib/format-number"
import { gameEntryPath, viewerGamePicksSummary } from "#/lib/game-entry"
import {
	formatRecord,
	IN_PLAY_REFETCH_MS,
	isGameInPlay,
	matchupLabel,
	seriesLead,
} from "#/lib/game-status"
import { pageMeta } from "#/lib/meta"
import {
	findGameWinnerQuestion,
	GAME_WINNER_LABEL,
} from "#/lib/official-game-questions"
import { postseasonHeading, seededName } from "#/lib/postseason"
import { buildGameSlug } from "#/lib/slug"

type GameTab = "official" | "community"

// A game's official questions always fit on one page - the who-wins question
// plus one catalog's worth (apps/api/src/db/catalog/game-question-catalog.ts)
// is well under this.
const OFFICIAL_LIMIT = 50

const sectionLabelClass = css({
	textStyle: "label",
	color: "fg.subtle",
})

const gameQuery = (id: string) => gqlQueryOptions(GameByIdDocument, { id })

const officialQuestionsQuery = (gameId: string) =>
	gqlQueryOptions(GameOfficialQuestionsDocument, {
		gameId,
		first: OFFICIAL_LIMIT,
	})

export const Route = createFileRoute("/_app/games/$gameId/{-$slug}")({
	component: RouteComponent,
	// The game's official questions with the viewer's call on each. The shell
	// only shows the rail from xl up; below that the Official tab's picks line
	// stands in for it.
	staticData: { rightRail: <GameRail /> },
	staleTime: 0,
	// Official is the default and stays off the url, so a shared game link
	// always opens on it.
	validateSearch: z.object({
		tab: z.literal("community").optional().catch(undefined),
	}),
	loaderDeps: ({ search }) => ({ tab: search.tab ?? "official" }),
	// head() can only read loaderData, so the meta-tag fields come back from
	// here; the component reads the same cache entries via its own hooks.
	// Official questions load on either tab, since the Game winner card above
	// the tabs comes from them.
	loader: async ({ context, params, deps }) => {
		const gamePromise = context.queryClient.query(gameQuery(params.gameId))
		await Promise.all([
			gamePromise,
			context.queryClient.query(officialQuestionsQuery(params.gameId)),
			deps.tab === "community"
				? context.queryClient.infiniteQuery(
						communityQuestionsQuery(params.gameId, "MOST_CALLED"),
					)
				: null,
		])
		const gameData = await gamePromise

		// The slug is decorative - the id ahead of it is what identifies the
		// game - so a missing or stale one is corrected here rather than 404ing.
		// 302, deliberately not 301: startsAt is rewritten on every sync pass
		// (a postponed game moves days), so this target genuinely changes, and a
		// browser that cached a 301 would pin visitors to the old date forever.
		// rel=canonical in the head below is what carries the consolidation to
		// crawlers instead.
		const game = gameData.game
		if (game) {
			const slug = buildGameSlug(game)
			if (params.slug !== slug) {
				throw redirect({
					to: "/games/$gameId/{-$slug}",
					params: { gameId: game.id, slug },
					search: deps.tab === "community" ? { tab: "community" } : {},
					statusCode: 302,
				})
			}
		}
		return { game: gameData.game ?? null }
	},
	head: ({ loaderData }) => {
		const game = loaderData?.game
		if (!game) return {}
		const round = game.postseason
			? `${postseasonHeading(game.postseason)}: `
			: ""
		return pageMeta({
			title: `${round}${seededName(game.awayTeam.name, game.postseason?.awaySeed)} @ ${seededName(game.homeTeam.name, game.postseason?.homeSeed)} · Called My Shot`,
			description: [
				seriesLead(game),
				`Call the questions on ${game.awayTeam.name} @ ${game.homeTeam.name} - the winner, the total, and the player lines.`,
			]
				.filter(Boolean)
				.join(" "),
			path: `/games/${game.id}/${buildGameSlug(game)}`,
		})
	},
})

function RouteComponent() {
	const { gameId } = Route.useParams()
	const { tab: tabParam } = Route.useSearch()
	const tab: GameTab = tabParam ?? "official"
	const navigate = Route.useNavigate()

	const { data: gameData } = useSuspenseQuery({
		...gameQuery(gameId),
		refetchInterval: (query) => {
			const game = query.state.data?.game
			return game && isGameInPlay(game) ? IN_PLAY_REFETCH_MS : false
		},
	})
	const { data: officialData } = useSuspenseQuery({
		...officialQuestionsQuery(gameId),
		refetchInterval:
			gameData.game && isGameInPlay(gameData.game) ? IN_PLAY_REFETCH_MS : false,
	})
	const me = useMe()
	const game = gameData.game
	const officialQuestions = officialData.questions.items

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

	// The headline call, shown above the tabs so neither one hides it. Absent
	// entirely when the game has none (before the daily sync has run) rather
	// than showing a placeholder that implies something's broken.
	const hero = findGameWinnerQuestion(officialQuestions)

	const matchup = matchupLabel(game)
	const picks = viewerGamePicksSummary(officialQuestions)
	const openQuestions = officialQuestions.filter(
		(q) => q.status === "OPEN" && new Date(q.locksAt) > new Date(),
	)
	const openPicks = openQuestions.filter((q) => q.viewerCall !== null).length

	function selectTab(next: GameTab) {
		navigate({
			search: next === "community" ? { tab: "community" } : {},
			replace: true,
			resetScroll: false,
		})
	}

	return (
		<VStack gap="6" alignItems="stretch" className={css({ maxWidth: "2xl" })}>
			<Breadcrumb>
				{/* The Games tab on this game's own day/week, not today's. */}
				<Breadcrumb.Link
					to="/leagues/$leagueSlug/games"
					params={{ leagueSlug: game.league.slug }}
					search={{ windowKey: game.windowKey }}
				>
					{game.league.abbreviation}
				</Breadcrumb.Link>
				<Breadcrumb.Current>{matchupLabel(game)}</Breadcrumb.Current>
			</Breadcrumb>

			<VStack gap="2" alignItems="stretch">
				<GameMatchupHeader
					game={game}
					starters={game}
					startAction={
						canSetGameReminder(game) && (
							<GameReminderButton
								gameId={game.id}
								hasReminder={game.viewerHasReminder}
							/>
						)
					}
				/>
				{/* The rail carries this from xl up, in the same treatment. */}
				{me && openQuestions.length > 0 && (
					<Link
						to="/challenges/new"
						search={{
							game: game.id,
							source: openPicks > 0 ? "game_picks" : "game",
						}}
						className={cx(
							button({ variant: "dark", size: "sm", fullWidth: true }),
							css({ xl: { display: "none" } }),
						)}
					>
						{openPicks > 0
							? "Challenge with these picks"
							: "Challenge on this game"}
					</Link>
				)}
			</VStack>

			{/* The rail carries this from xl up; below that the rail is hidden,
			    and a phone beside the TV is where it matters most. */}
			{game.viewerGroupBoards.length > 0 && (
				<div className={css({ display: { base: "block", xl: "none" } })}>
					<GameGroupBoards gameId={game.id} boards={game.viewerGroupBoards} />
				</div>
			)}

			{hero && (
				<VStack gap="2" alignItems="stretch">
					<span className={sectionLabelClass}>{GAME_WINNER_LABEL}</span>
					<GameOfficialCard question={hero} />
				</VStack>
			)}

			{/* The series' own questions, on every game of the series. They lock
			    when Game 1 starts, so on a later game they show how the calls
			    made before the series stand. */}
			{game.postseason && game.postseason.seriesQuestions.length > 0 && (
				<VStack gap="2" alignItems="stretch">
					<span className={sectionLabelClass}>
						The {game.postseason.roundLabel}
					</span>
					<VStack gap="3" alignItems="stretch">
						{game.postseason.seriesQuestions.map((question) => (
							<QuestionCard
								key={question.id}
								question={question}
								showGame={false}
							/>
						))}
					</VStack>
				</VStack>
			)}

			<Tabs value={tab} onValueChange={selectTab}>
				<Tabs.List>
					<Tabs.Trigger value="official">Official</Tabs.Trigger>
					<Tabs.Trigger value="community">
						Community
						{game.openCommunityQuestionCount > 0 && (
							<CountBadge count={game.openCommunityQuestionCount} />
						)}
					</Tabs.Trigger>
				</Tabs.List>
			</Tabs>

			{tab === "official" ? (
				<VStack gap="6" alignItems="stretch">
					{me && picks.calledCount > 0 && (
						<HStack
							justify="space-between"
							gap="3"
							display={{ base: "flex", xl: "none" }}
						>
							<Link
								to={gameEntryPath(game.id, me.username)}
								className={arrowLink({ tone: "primary", align: "parent" })}
							>
								{/* Says what the linked page holds, and so what the icons
								    beside it share: the count until a question settles,
								    the record after, same as buildGameTweet. */}
								{picks.wins + picks.losses === 0
									? `${picks.calledCount} of ${picks.questionCount} called`
									: `${formatRecord(picks.wins, picks.losses)} · ${formatSigned(picks.points, { zeroSign: true })} pts`}{" "}
								· See your picks →
							</Link>
							<GameShareRow
								gameId={game.id}
								username={me.username}
								shareTitle={`@${me.username}'s ${matchup} picks`}
								surface="game_page"
								layout="icons"
								tweetText={buildGameTweet({ matchup, ...picks, isOwn: true })}
							/>
						</HStack>
					)}
					<GameOfficialQuestions
						game={game}
						questions={officialQuestions.filter((q) => q.id !== hero?.id)}
					/>
				</VStack>
			) : (
				<GameCommunityQuestions gameId={game.id} />
			)}
		</VStack>
	)
}

// Reads the cache entries RouteComponent loads and polls, so the rail moves
// with the page rather than fetching on its own.
function GameRail() {
	const { gameId } = Route.useParams()
	const { data: gameData } = useSuspenseQuery(gameQuery(gameId))
	const { data: officialData } = useSuspenseQuery(
		officialQuestionsQuery(gameId),
	)
	const me = useMe()
	if (!gameData.game) return null
	return (
		<VStack gap="6" alignItems="stretch">
			<GameSetRail
				game={gameData.game}
				questions={officialData.questions.items}
				communityQuestions={gameData.game.viewerCommunityQuestions}
				username={me?.username ?? null}
			/>
			<GameGroupBoards
				gameId={gameData.game.id}
				boards={gameData.game.viewerGroupBoards}
			/>
		</VStack>
	)
}
