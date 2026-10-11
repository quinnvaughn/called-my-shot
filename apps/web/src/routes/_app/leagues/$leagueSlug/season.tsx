import { createFileRoute } from "@tanstack/react-router"
import {
	SeasonQuestionFeed,
	preloadSeasonQuestionFeed,
} from "#/components/leagues/season-question-feed"
import { pageMeta } from "#/lib/meta"

export const Route = createFileRoute("/_app/leagues/$leagueSlug/season")({
	component: RouteComponent,
	staleTime: 0,
	loader: ({ context }) =>
		preloadSeasonQuestionFeed(context.queryClient, context.league.id),
	head: ({ match }) => {
		const league = match.context.league
		return pageMeta({
			title: `${league.name} · Season long · Called My Shot`,
			description: `${league.name} questions that run the whole season: stat lines, head-to-heads and stat leaders, from the site and from players.`,
			path: `/leagues/${league.slug}/season`,
		})
	},
})

// Every season-long question in this league that isn't an award, official and
// player-written together. Awards, win totals and titles are on the Ballots
// tab.
function RouteComponent() {
	const { league } = Route.useRouteContext()
	return (
		<SeasonQuestionFeed
			league={league}
			emptyText="No season questions open right now."
		/>
	)
}
