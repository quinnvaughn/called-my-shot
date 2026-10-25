import { createFileRoute, Link } from "@tanstack/react-router"
import { PostFeed } from "#/components/posts/post-feed"
import { button } from "#/components/ui/button"
import { EmptyState } from "#/components/ui/empty-state"
import { spaceFeedQuery } from "#/graphql/posts/queries"
import { pageMeta } from "#/lib/meta"

const leagueFeedQuery = (leagueId: string) =>
	spaceFeedQuery({ kind: "LEAGUE", id: leagueId })

// Posts tagged to this league or any of its teams and players. Group posts
// never land here; they stay in their group.
export const Route = createFileRoute("/_app/leagues/$leagueSlug/feed")({
	component: RouteComponent,
	staleTime: 0,
	loader: ({ context }) =>
		context.queryClient.infiniteQuery(leagueFeedQuery(context.league.id)),
	head: ({ match }) => {
		const league = match.context.league
		return pageMeta({
			title: `${league.name} · Feed · Called My Shot`,
			description: `What people are posting about the ${league.name}: Mount Rushmores for every franchise and the arguments under them.`,
			path: `/leagues/${league.slug}/feed`,
		})
	},
})

function RouteComponent() {
	const { league } = Route.useRouteContext()
	const { leagueSlug } = Route.useParams()
	return (
		<PostFeed
			query={leagueFeedQuery(league.id)}
			empty={
				<EmptyState
					action={
						<Link
							to="/leagues/$leagueSlug/teams"
							params={{ leagueSlug }}
							className={button({ variant: "outline", size: "sm" })}
						>
							Pick a team
						</Link>
					}
				>
					{`Nothing posted in the ${league.abbreviation} yet. Post a Mount Rushmore from Create, or pick a team and make yours for its franchise.`}
				</EmptyState>
			}
		/>
	)
}
