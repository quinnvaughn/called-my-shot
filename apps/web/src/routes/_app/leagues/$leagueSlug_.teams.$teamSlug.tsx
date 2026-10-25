import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, notFound } from "@tanstack/react-router"
import { FaRegTimesCircle } from "react-icons/fa"
import { VStack } from "styled-system/jsx"
import { PostFeed } from "#/components/posts/post-feed"
import { PromptConsensusCard } from "#/components/posts/prompt-consensus-card"
import { TeamSpaceHeader } from "#/components/teams/team-space-header"
import { Breadcrumb } from "#/components/ui/breadcrumb"
import { EmptyState } from "#/components/ui/empty-state"
import { NotFound } from "#/components/ui/not-found"
import { SectionLabel } from "#/components/ui/section-label"
import { promptPageQuery, spaceFeedQuery } from "#/graphql/posts/queries"
import { leagueTeamSpaceQuery } from "#/graphql/sports/leagues/queries"
import { pageMeta } from "#/lib/meta"
import { teamSlug } from "#/lib/team-slug"

const teamFeedQuery = (teamId: string) =>
	spaceFeedQuery({ kind: "TEAM", id: teamId })

// A team's own space: its franchise Rushmore as the crowd has it, then what
// people post about the team. Outside the league layout, so the league's
// header and tabs don't stack above the team's; the breadcrumb leads back.
export const Route = createFileRoute(
	"/_app/leagues/$leagueSlug_/teams/$teamSlug",
)({
	component: RouteComponent,
	notFoundComponent: TeamNotFound,
	staleTime: 0,
	beforeLoad: ({ context, params }) => {
		const league = context.leagues.find((l) => l.slug === params.leagueSlug)
		if (!league) throw notFound()
		return { league }
	},
	loader: async ({ context, params }) => {
		const data = await context.queryClient.query(
			leagueTeamSpaceQuery(context.league.id),
		)
		const team = data.league?.teams.find(
			(t) => teamSlug(t.abbreviation) === params.teamSlug,
		)
		if (!team) throw notFound()
		const promptCode = team.rushmorePrompt?.code
		await Promise.all([
			context.queryClient.infiniteQuery(teamFeedQuery(team.id)),
			promptCode
				? context.queryClient.query(promptPageQuery(promptCode))
				: null,
		])
		return { team: { name: team.name } }
	},
	head: ({ match, loaderData }) => {
		const team = loaderData?.team
		if (!team) return {}
		const league = match.context.league
		return pageMeta({
			title: `${team.name} · ${league.abbreviation} · Called My Shot`,
			description: `The ${team.name} all-time Mount Rushmore as the crowd has it, and everything people post about the team.`,
			path: `/leagues/${league.slug}/teams/${match.params.teamSlug}`,
		})
	},
})

function TeamNotFound() {
	return (
		<NotFound
			icon={<FaRegTimesCircle size={24} />}
			eyebrowText="Team"
			heading="This team doesn't exist"
			subtitle="Double check the link, or pick a team from its league's Teams tab."
			link={{ text: "Back home", url: "/" }}
		/>
	)
}

function RouteComponent() {
	const { league } = Route.useRouteContext()
	const { leagueSlug, teamSlug: slug } = Route.useParams()
	const { data } = useSuspenseQuery(leagueTeamSpaceQuery(league.id))
	const team = data.league?.teams.find((t) => teamSlug(t.abbreviation) === slug)

	// The loader already threw notFound() for a missing team; this narrows
	// the type for the render below.
	if (!team) return null
	const promptCode = team.rushmorePrompt?.code ?? null

	return (
		<VStack gap="6" alignItems="stretch">
			<Breadcrumb>
				<Breadcrumb.Link to="/leagues/$leagueSlug" params={{ leagueSlug }}>
					{league.abbreviation}
				</Breadcrumb.Link>
				<Breadcrumb.Link
					to="/leagues/$leagueSlug/teams"
					params={{ leagueSlug }}
				>
					Teams
				</Breadcrumb.Link>
				<Breadcrumb.Current>{team.name}</Breadcrumb.Current>
			</Breadcrumb>
			<TeamSpaceHeader team={team} leagueAbbreviation={league.abbreviation} />
			{promptCode && <PromptConsensusCard code={promptCode} />}
			<VStack gap="3" alignItems="stretch">
				<SectionLabel>Feed</SectionLabel>
				<PostFeed
					query={teamFeedQuery(team.id)}
					empty={
						<EmptyState>
							{promptCode
								? `Nothing posted about the ${team.name} yet. Make your ${team.name} Rushmore and it starts here.`
								: `Nothing posted about the ${team.name} yet.`}
						</EmptyState>
					}
				/>
			</VStack>
		</VStack>
	)
}
