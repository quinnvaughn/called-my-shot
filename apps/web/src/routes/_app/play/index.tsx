import { createFileRoute } from "@tanstack/react-router"
import { VStack } from "styled-system/jsx"
import { PlayGameCard } from "#/components/play/play-game-card"
import { PageHeader } from "#/components/ui/page-header"
import { pageMeta } from "#/lib/meta"
import { PLAY_GAMES } from "#/lib/play-games"

export const Route = createFileRoute("/_app/play/")({
	component: RouteComponent,
	head: () =>
		pageMeta({
			title: "Play · Called My Shot",
			description: "Daily sports games.",
			path: "/play",
		}),
})

function RouteComponent() {
	return (
		<VStack gap="6" alignItems="stretch">
			<PageHeader title="Play" subtitle="Daily games" />
			<VStack gap="3" alignItems="stretch">
				{PLAY_GAMES.map((game) => (
					<PlayGameCard key={game.slug} game={game} />
				))}
			</VStack>
		</VStack>
	)
}
