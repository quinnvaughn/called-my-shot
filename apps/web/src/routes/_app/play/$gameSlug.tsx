import { createFileRoute, notFound } from "@tanstack/react-router"
import { FaRegTimesCircle } from "react-icons/fa"
import { VStack } from "styled-system/jsx"
import { Card } from "#/components/ui/card"
import { EmptyState } from "#/components/ui/empty-state"
import { NotFound } from "#/components/ui/not-found"
import { PageHeader } from "#/components/ui/page-header"
import { pageMeta } from "#/lib/meta"
import { playGameBySlug } from "#/lib/play-games"

export const Route = createFileRoute("/_app/play/$gameSlug")({
	component: RouteComponent,
	notFoundComponent: () => (
		<NotFound
			icon={<FaRegTimesCircle size={24} />}
			eyebrowText="Play"
			heading="This game doesn't exist"
			subtitle="Double check the link, or pick a game from Play."
			link={{ text: "Back to Play", url: "/play" }}
		/>
	),
	loader: ({ params }) => {
		const game = playGameBySlug(params.gameSlug)
		if (!game) throw notFound()
		return { name: game.name, description: game.description }
	},
	head: ({ loaderData, params }) =>
		loaderData
			? pageMeta({
					title: `${loaderData.name} · Called My Shot`,
					description: loaderData.description,
					path: `/play/${params.gameSlug}`,
				})
			: {},
})

function RouteComponent() {
	const game = Route.useLoaderData()
	return (
		<VStack gap="6" alignItems="stretch">
			<PageHeader title={game.name} description={game.description} />
			<Card>
				<Card.Body>
					<EmptyState>This game is still being built.</EmptyState>
				</Card.Body>
			</Card>
		</VStack>
	)
}
