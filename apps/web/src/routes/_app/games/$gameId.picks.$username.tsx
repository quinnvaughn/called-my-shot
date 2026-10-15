import { useQuery, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { FaRegTimesCircle } from "react-icons/fa"
import { VStack } from "styled-system/jsx"
import { z } from "zod"
import { GameMatchupHeader } from "#/components/games/game-matchup-header"
import { GamePicksBreadcrumb } from "#/components/games/game-picks-breadcrumb"
import { GamePicksCallLists } from "#/components/games/game-picks-call-lists"
import { GamePicksSummaryCard } from "#/components/games/game-picks-summary-card"
import { PresserSection } from "#/components/pressers/presser-section/presser-section"
import { NotFound } from "#/components/ui/not-found"
import { PageHeader } from "#/components/ui/page-header"
import { groupCrumbQuery } from "#/graphql/groups/queries"
import { gqlQueryOptions } from "#/graphql/query-options"
import { GameEntryDocument } from "#/graphql/sports/games/queries"
import { useMe } from "#/hooks/use-me"
import { formatSigned } from "#/lib/format-number"
import { gameEntryPath, gameEntryRows } from "#/lib/game-entry"
import { formatRecord, matchupLabel } from "#/lib/game-status"
import { pageMeta } from "#/lib/meta"
import { buildGameSlug } from "#/lib/slug"

const gameEntryQuery = (id: string, username: string) =>
	gqlQueryOptions(GameEntryDocument, { id, username })

// Public, like the game page and /ballots/:slug/:username - this url exists
// to be pasted somewhere. Left out of the sitemap for the same reason: one
// person's picks aren't something to index.
export const Route = createFileRoute("/_app/games/$gameId/picks/$username")({
	component: RouteComponent,
	staleTime: 0,
	// Set when the page was opened from a group's board for this game, so the
	// breadcrumb leads back to it. Ignored when the viewer can't see the group.
	validateSearch: z.object({ group: z.string().optional().catch(undefined) }),
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
						`${formatSigned(entry.points, { zeroSign: true })} pts`,
					]
				: []
		const heading = `@${username}'s ${matchupLabel(game)} picks · ${game.league.abbreviation}`

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
	const me = useMe()
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

	const matchup = matchupLabel(game)
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
	const { called, notCalledYet, missed, isOpen, hasOpenCalls } = gameEntryRows(
		entry.members,
	)

	return (
		<VStack gap="6" alignItems="stretch">
			<GamePicksBreadcrumb
				game={game}
				crumbGroup={crumbGroup}
				matchup={matchup}
				gameParams={gameParams}
				username={entry.user.username}
			/>

			<PageHeader title={`${entry.user.name}'s picks`} />

			{/* The same matchup the game page opens with, minus starters: the
			    picks only mean something against the game they were made on. */}
			<GameMatchupHeader game={game} />

			<GamePicksSummaryCard
				game={game}
				entry={entry}
				matchup={matchup}
				gameParams={gameParams}
				isOwn={isOwn}
				isOpen={isOpen}
				hasOpenCalls={hasOpenCalls}
			/>
			{entry.presser && (
				<PresserSection
					presser={entry.presser}
					viewerId={me?.id ?? null}
					viaGroup={groupId !== undefined}
				/>
			)}
			<GamePicksCallLists
				entry={entry}
				called={called}
				notCalledYet={notCalledYet}
				missed={missed}
			/>
		</VStack>
	)
}
