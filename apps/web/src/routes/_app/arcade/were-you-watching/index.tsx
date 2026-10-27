import { createFileRoute } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import {
	WATCH_LEAGUES,
	type WatchLeagueSlug,
	WatchTeamPicker,
} from "#/components/arcade/were-you-watching/watch-team-picker"
import { WatchYourTeams } from "#/components/arcade/were-you-watching/watch-your-teams"
import { PageHeader } from "#/components/ui/page-header"
import {
	watchHubQuery,
	watchTeamsQuery,
} from "#/graphql/were-you-watching/queries"
import { pageMeta } from "#/lib/meta"

const isWatchLeague = (slug: string): slug is WatchLeagueSlug =>
	(WATCH_LEAGUES as readonly string[]).includes(slug)

// Were You Watching?'s front door: pick a league, then a team. The viewer's
// favorite teams sit above as a shortcut, and the league tabs open on the
// league of the first one with a quiz up, so a favorite in its offseason
// doesn't open on a page of greyed-out teams.
export const Route = createFileRoute("/_app/arcade/were-you-watching/")({
	component: RouteComponent,
	loader: async ({ context }) => {
		const hub = await context.queryClient.query(watchHubQuery)
		const favorite =
			hub.watchHub.find((e) => e.status === "LIVE")?.league.slug ?? ""
		const league = isWatchLeague(favorite) ? favorite : WATCH_LEAGUES[0]
		await context.queryClient.query(watchTeamsQuery(league))
		return { league }
	},
	head: () =>
		pageMeta({
			title: "Were You Watching? · Called My Shot",
			description:
				"A quiz on your team's last game, straight from the box score. Four choices, 10 seconds each, and a new one after every game.",
			path: "/arcade/were-you-watching",
		}),
})

function RouteComponent() {
	const { league } = Route.useLoaderData()
	return (
		<VStack
			gap="6"
			alignItems="stretch"
			className={css({ maxWidth: "3xl", width: "full", marginInline: "auto" })}
		>
			<PageHeader
				title="Were You Watching?"
				subtitle="Pick a team for questions on its last game. Four choices, 10 seconds each."
			/>
			<WatchYourTeams />
			<WatchTeamPicker initialLeague={league} />
		</VStack>
	)
}
