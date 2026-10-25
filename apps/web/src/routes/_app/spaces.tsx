import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Grid, HStack, VStack } from "styled-system/jsx"
import { GroupCard } from "#/components/groups/group-card"
import { NewGroupModal } from "#/components/groups/new-group-modal"
import { SpaceLeagueRow } from "#/components/spaces/space-league-row"
import { SpaceTeamRow } from "#/components/spaces/space-team-row"
import { Button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { EmptyState } from "#/components/ui/empty-state"
import { PageHeader } from "#/components/ui/page-header"
import { SectionLabel } from "#/components/ui/section-label"
import { myFollowsQuery } from "#/graphql/follows/queries"
import { MyGroupsDocument } from "#/graphql/generated/graphql"
import { gqlQueryOptions } from "#/graphql/query-options"
import { useMe } from "#/hooks/use-me"
import { openModal } from "#/stores/modal-store"

const myGroupsQuery = gqlQueryOptions(MyGroupsDocument, {})

// Every space in one list: the leagues, each with a follow toggle, the
// teams the viewer follows, then their groups and the way to start one. The
// bottom nav's Spaces tab on phones, and the compass on the space rail.
export const Route = createFileRoute("/_app/spaces")({
	component: RouteComponent,
	loader: async ({ context }) => {
		if (context.me) await context.queryClient.query(myGroupsQuery)
	},
})

function RouteComponent() {
	const me = useMe()
	const { leagues } = Route.useRouteContext()
	const { data } = useQuery({ ...myGroupsQuery, enabled: !!me })
	const groups = data?.myGroups ?? []
	// Loaded by _app for a signed-in viewer.
	const { data: followsData } = useQuery({ ...myFollowsQuery, enabled: !!me })
	const followedIds = new Set(
		(followsData?.myFollows.leagues ?? []).map((league) => league.id),
	)
	const followedTeams = followsData?.myFollows.teams ?? []
	// Same rule as the space rail: a signed-in viewer's followed leagues
	// first, with the rest under them to follow; signed out, one list.
	const leagueLists = me
		? [
				{
					label: "Your leagues",
					leagues: leagues.filter((league) => followedIds.has(league.id)),
				},
				{
					label: "More leagues",
					leagues: leagues.filter((league) => !followedIds.has(league.id)),
				},
			]
		: [{ label: "Leagues", leagues }]

	return (
		<VStack gap="8" alignItems="stretch">
			<PageHeader
				title="Spaces"
				subtitle="Leagues and your groups"
				description="Follow a league to put its posts in your Home feed."
			/>

			{leagueLists.map(
				(list) =>
					list.leagues.length > 0 && (
						<VStack key={list.label} gap="3" alignItems="stretch">
							<SectionLabel>{list.label}</SectionLabel>
							<Card>
								{list.leagues.map((league) => (
									<SpaceLeagueRow
										key={league.id}
										league={league}
										following={followedIds.has(league.id)}
									/>
								))}
							</Card>
						</VStack>
					),
			)}

			{followedTeams.length > 0 && (
				<VStack gap="3" alignItems="stretch">
					<SectionLabel>Your teams</SectionLabel>
					<Card>
						{followedTeams.map((team) => (
							<SpaceTeamRow key={team.id} team={team} />
						))}
					</Card>
				</VStack>
			)}

			{me && (
				<VStack gap="3" alignItems="stretch">
					<HStack justifyContent="space-between" alignItems="center">
						<SectionLabel>Groups</SectionLabel>
						<Button
							variant="solid"
							size="sm"
							onClick={() => openModal(<NewGroupModal leagues={leagues} />)}
						>
							+ New Group
						</Button>
					</HStack>
					{groups.length > 0 ? (
						<Grid gap="6" gridTemplateColumns="1fr">
							{groups.map((group) => (
								<GroupCard key={group.id} group={group} />
							))}
						</Grid>
					) : (
						<EmptyState>
							No groups yet. Start one, or open a friend's invite link to join theirs.
						</EmptyState>
					)}
				</VStack>
			)}
		</VStack>
	)
}
