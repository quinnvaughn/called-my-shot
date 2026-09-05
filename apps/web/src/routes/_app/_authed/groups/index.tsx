import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Grid, VStack } from "styled-system/jsx"
import { GroupCard } from "#/components/groups/group-card"
import { JoinCode } from "#/components/groups/join-code"
import { NewGroupModal } from "#/components/groups/new-group-modal"
import { Button } from "#/components/ui/button"
import { InfoCard } from "#/components/ui/info-card"
import { PageHeader } from "#/components/ui/page-header"
import { MyGroupsDocument } from "#/graphql/generated/graphql"
import { gqlQueryOptions } from "#/graphql/query-options"
import { openModal } from "#/stores/modal-store"

const myGroupsQuery = gqlQueryOptions(MyGroupsDocument, {})

export const Route = createFileRoute("/_app/_authed/groups/")({
	component: RouteComponent,
	staticData: {
		rightRail: (
			<VStack alignItems="stretch">
				<InfoCard
					heading="Invite Only"
					body="Private by default. Get in with a link or code."
				/>
				<InfoCard
					heading="How Group Rank Works"
					body="This isn't a separate score. It's your same real points and accuracy, just filtered to compare you against people you actually know instead of the whole leaderboard."
				/>
			</VStack>
		),
	},
	loader: ({ context }) => context.queryClient.query(myGroupsQuery),
})

function RouteComponent() {
	const { data } = useSuspenseQuery(myGroupsQuery)
	const groups = data.myGroups
	return (
		<VStack gap="6" alignItems="stretch">
			<PageHeader
				title="Groups"
				subtitle="Same real points as your profile, just ranked against your group."
				action={
					<Button
						variant="solid"
						size="sm"
						onClick={() => openModal(<NewGroupModal />)}
					>
						+ New Group
					</Button>
				}
			/>
			<JoinCode />
			<Grid gap="6" gridTemplateColumns={"1fr"}>
				{groups.map((g) => (
					<GroupCard key={g.id} group={g} />
				))}
			</Grid>
		</VStack>
	)
}
