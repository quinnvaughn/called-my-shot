import { createFileRoute } from "@tanstack/react-router"
import { css } from "styled-system/css"
import { Grid, HStack, VStack } from "styled-system/jsx"
import { GroupCard } from "#/components/groups/group-card"
import { JoinCode } from "#/components/groups/join-code"
import { NewGroupModal } from "#/components/groups/new-group-modal"
import { Button } from "#/components/ui/button"
import { InfoCard } from "#/components/ui/info-card"
import { MyGroupsDocument } from "#/graphql/generated/graphql"
import { openModal } from "#/stores/modal-store"

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
	loader: async ({ context }) => {
		const { data } = await context.apolloClient.query({
			query: MyGroupsDocument,
		})

		return { groups: data?.myGroups || [] }
	},
})

function RouteComponent() {
	const { groups } = Route.useLoaderData()
	return (
		<VStack gap="6" alignItems="stretch">
			<HStack alignItems="flex-start" justify="space-between" gap="4">
				<VStack gap="1" alignItems="flex-start">
					<h1 className={css({ fontFamily: "heading", fontSize: "3xl" })}>
						Groups
					</h1>
					<p
						className={css({
							textTransform: "uppercase",
							fontFamily: "mono",
							fontSize: "xs",
							color: "fg.muted",
						})}
					>
						Same real points as your profile, just ranked against your group.
					</p>
				</VStack>
				<Button
					variant="solid"
					size="sm"
					onClick={() => openModal(<NewGroupModal />)}
				>
					+ New Group
				</Button>
			</HStack>
			<JoinCode />
			<Grid gap="6" gridTemplateColumns={"1fr"}>
				{groups.map((g) => (
					<GroupCard key={g.id} group={g} />
				))}
			</Grid>
		</VStack>
	)
}
