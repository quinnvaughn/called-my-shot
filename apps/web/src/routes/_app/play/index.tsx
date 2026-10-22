import { createFileRoute } from "@tanstack/react-router"
import { VStack } from "styled-system/jsx"
import { NameThatSeasonHubCard } from "#/components/play/name-that-season/name-that-season-hub-card"
import { PlayGameCard } from "#/components/play/play-game-card"
import { PageHeader } from "#/components/ui/page-header"
import { SectionLabel } from "#/components/ui/section-label"
import { seasonPuzzleTodayQuery } from "#/graphql/season-puzzles/queries"
import { pageMeta } from "#/lib/meta"
import { PLAY_GAMES } from "#/lib/play-games"

export const Route = createFileRoute("/_app/play/")({
	component: RouteComponent,
	loader: ({ context }) => context.queryClient.query(seasonPuzzleTodayQuery),
	head: () =>
		pageMeta({
			title: "Play · Called My Shot",
			description: "Daily sports games.",
			path: "/play",
		}),
})

function RouteComponent() {
	const others = PLAY_GAMES.filter((game) => game.slug !== "name-that-season")
	return (
		<VStack gap="6" alignItems="stretch">
			<PageHeader title="Play" subtitle="Daily games" />
			<NameThatSeasonHubCard />
			<VStack gap="3" alignItems="stretch">
				<SectionLabel>Coming soon</SectionLabel>
				{others.map((game) => (
					<PlayGameCard key={game.slug} game={game} />
				))}
			</VStack>
		</VStack>
	)
}
