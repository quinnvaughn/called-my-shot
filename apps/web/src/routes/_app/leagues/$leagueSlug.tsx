import { useSuspenseQuery } from "@tanstack/react-query"
import {
	createFileRoute,
	notFound,
	Outlet,
	redirect,
} from "@tanstack/react-router"
import { FaRegTimesCircle } from "react-icons/fa"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { SeasonPlayCard } from "#/components/leagues/season-play-card"
import { NotFound } from "#/components/ui/not-found"
import { PageHeader } from "#/components/ui/page-header"
import { Tabs } from "#/components/ui/tabs"
import { leagueQuery } from "#/graphql/queries/sports"
import { gamesInWindowLabel } from "#/lib/game-status"
import { pageMeta } from "#/lib/meta"
import { postseasonDescription, roundsPhrase } from "#/lib/postseason"
import { isUuid } from "#/lib/uuid"

export const Route = createFileRoute("/_app/leagues/$leagueSlug")({
	component: RouteComponent,
	notFoundComponent: LeagueNotFound,
	staleTime: 0,
	// Resolves the room's slug against the league list _app already put in
	// context, so the id every league-scoped query underneath still wants
	// costs no extra request. Runs in beforeLoad rather than the loader
	// because the tab loaders below need that id and would otherwise race
	// this one.
	beforeLoad: ({ context, params, location }) => {
		const bySlug = context.leagues.find((l) => l.slug === params.leagueSlug)
		if (bySlug) return { league: bySlug }

		// Rooms were addressed by uuid before they moved to slugs, so links
		// shared back then still land here. Rewriting the pathname rather than
		// redirecting to the bare room preserves the tab and its search params,
		// and a 301 from the server (thrown here, before any html renders) is
		// what lets a crawler follow through to the meta tags below.
		const byId = isUuid(params.leagueSlug)
			? context.leagues.find((l) => l.id === params.leagueSlug)
			: undefined
		if (byId) {
			throw redirect({
				href:
					location.pathname.replace(params.leagueSlug, byId.slug) +
					location.searchStr,
				statusCode: 301,
			})
		}

		throw notFound()
	},
	// head() can only read loaderData, never the query cache, so this returns
	// the handful of fields the meta tags below need. The component reads the
	// same cache entry through useSuspenseQuery rather than these.
	loader: async ({ context }) => {
		const data = await context.queryClient.query(leagueQuery(context.league.id))
		if (!data.league) throw notFound()
		return {
			league: { name: data.league.name, slug: data.league.slug },
			postseason: data.league.postseason ?? null,
		}
	},
	head: ({ loaderData }) => {
		const league = loaderData?.league
		if (!league) return {}
		const postseason = loaderData.postseason

		// Only the tabs below are ever indexed (see the sitemap), but this
		// still covers the bare /leagues/$slug url before its redirect and
		// serves as the fallback any future tab inherits until it sets its own.
		// Canonical slug url even when the request arrived on a uuid, so the
		// old links consolidate onto this one rather than being indexed twice.
		return pageMeta({
			title: postseason
				? `${league.name} Postseason · Called My Shot`
				: `${league.name} · Called My Shot`,
			description: postseason
				? postseasonDescription(league.name, postseason.roundLabels)
				: `Every ${league.name} call on the board - game props, season awards, and where the crowd is wrong.`,
			path: `/leagues/${league.slug}`,
		})
	},
})

// By subject, not by who wrote the question: official and player-written
// questions share each tab, and the Official badge tells them apart.
const TAB_ITEMS = [
	{ to: "/leagues/$leagueSlug/games", label: "Games" },
	{ to: "/leagues/$leagueSlug/season", label: "Season long" },
	{ to: "/leagues/$leagueSlug/ballots", label: "Ballots" },
] as const

function LeagueNotFound() {
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

function RouteComponent() {
	const { league: contextLeague } = Route.useRouteContext()
	const { data } = useSuspenseQuery(leagueQuery(contextLeague.id))
	const { leagueSlug } = Route.useParams()

	// The loader already threw notFound() for a missing league; this narrows
	// the type for the render below.
	if (!data.league) return null
	const league = data.league
	const currentSeason = data.currentSeason ?? null
	const postseason = league.postseason ?? null

	return (
		<VStack gap="6" alignItems="stretch" className={css({ maxWidth: "3xl" })}>
			<PageHeader
				title={league.name}
				subtitle={[
					league.abbreviation,
					currentSeason &&
						(postseason
							? `${currentSeason.displayName} Postseason`
							: currentSeason.displayName),
					postseason && roundsPhrase(postseason.roundLabels),
					gamesInWindowLabel(league.currentWindowGameCount, league.windowType),
				]
					.filter(Boolean)
					.join(" · ")}
			/>
			{league.viewerSeasonPlay && (
				<SeasonPlayCard
					play={league.viewerSeasonPlay}
					league={league.abbreviation}
				/>
			)}
			<Tabs.List>
				{TAB_ITEMS.map((item) => (
					<Tabs.LinkTrigger key={item.to} to={item.to} params={{ leagueSlug }}>
						{item.label}
					</Tabs.LinkTrigger>
				))}
			</Tabs.List>
			<Outlet />
		</VStack>
	)
}
