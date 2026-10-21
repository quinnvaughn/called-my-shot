import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Grid, HStack, VStack } from "styled-system/jsx"
import { GroupCard } from "#/components/groups/group-card"
import { NewGroupModal } from "#/components/groups/new-group-modal"
import { SpaceLeagueRow } from "#/components/spaces/space-league-row"
import { Button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { EmptyState } from "#/components/ui/empty-state"
import { InfoCard } from "#/components/ui/info-card"
import { PageHeader } from "#/components/ui/page-header"
import { SectionLabel } from "#/components/ui/section-label"
import { MyGroupsDocument } from "#/graphql/generated/graphql"
import { gqlQueryOptions } from "#/graphql/query-options"
import { useMe } from "#/hooks/use-me"
import { openModal } from "#/stores/modal-store"

const myGroupsQuery = gqlQueryOptions(MyGroupsDocument, {})

// Every space in one list: the leagues, then the viewer's groups and the way
// to start one. The bottom nav's Spaces tab on phones; desktop
// has the space rail instead.
export const Route = createFileRoute("/_app/spaces")({
	component: RouteComponent,
	staticData: {
		rightRail: (
			<VStack alignItems="stretch">
				<InfoCard
					heading="Invite Only"
					body="Groups are private by default. Get in with an invite link."
				/>
				<InfoCard
					heading="How Group Rank Works"
					body="This isn't a separate score. It's your same real points and accuracy, just filtered to compare you against people you actually know instead of the whole leaderboard."
				/>
			</VStack>
		),
	},
	loader: async ({ context }) => {
		if (context.me) await context.queryClient.query(myGroupsQuery)
	},
})

function RouteComponent() {
	const me = useMe()
	const { leagues } = Route.useRouteContext()
	const { data } = useQuery({ ...myGroupsQuery, enabled: !!me })
	const groups = data?.myGroups ?? []

	return (
		<VStack gap="8" alignItems="stretch">
			<PageHeader title="Spaces" subtitle="Leagues and your groups" />

			<VStack gap="3" alignItems="stretch">
				<SectionLabel>Leagues</SectionLabel>
				<Card>
					{leagues.map((league) => (
						<SpaceLeagueRow key={league.id} league={league} />
					))}
				</Card>
			</VStack>

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
