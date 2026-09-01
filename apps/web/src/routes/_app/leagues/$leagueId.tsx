import { createFileRoute, Outlet } from "@tanstack/react-router"
import { FaRegTimesCircle } from "react-icons/fa"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { NotFound } from "#/components/ui/not-found"
import { PageHeader } from "#/components/ui/page-header"
import { Tabs } from "#/components/ui/tabs"
import { LeagueByIdDocument } from "#/graphql/queries/sports"
import { gamesTodayLabel } from "#/lib/game-status"

export const Route = createFileRoute("/_app/leagues/$leagueId")({
	component: RouteComponent,
	staleTime: 0,
	loader: async ({ context, params }) => {
		const { data } = await context.apolloClient.query({
			query: LeagueByIdDocument,
			variables: { id: params.leagueId },
			fetchPolicy: "network-only",
		})
		return { league: data?.league ?? null, currentSeason: data?.currentSeason ?? null }
	},
	head: ({ loaderData }) => {
		const league = loaderData?.league
		if (!league) return {}
		return { meta: [{ title: `${league.name} · Called My Shot` }] }
	},
})

const TAB_ITEMS = [
	{ to: "/leagues/$leagueId/games", label: "Games" },
	{ to: "/leagues/$leagueId/season", label: "Season" },
	{ to: "/leagues/$leagueId/feed", label: "Feed" },
] as const

function RouteComponent() {
	const { league, currentSeason } = Route.useLoaderData()
	const { leagueId } = Route.useParams()

	if (!league) {
		return (
			<NotFound
				icon={<FaRegTimesCircle size={24} />}
				eyebrowText="League"
				heading="This league doesn't exist"
				subtitle="Double check the link, or pick a league from the sidebar."
				link={{ text: "Back home", url: "/home" }}
			/>
		)
	}

	return (
		<VStack
			gap="6"
			alignItems="stretch"
			className={css({ maxWidth: "3xl" })}
		>
			<PageHeader
				title={league.name}
				subtitle={[
					currentSeason
						? `${league.abbreviation} · ${currentSeason.displayName}`
						: league.abbreviation,
					gamesTodayLabel(league.gamesTodayCount),
				].join(" · ")}
			/>
			<Tabs.List>
				{TAB_ITEMS.map((item) => (
					<Tabs.LinkTrigger key={item.to} to={item.to} params={{ leagueId }}>
						{item.label}
					</Tabs.LinkTrigger>
				))}
			</Tabs.List>
			<Outlet />
		</VStack>
	)
}
