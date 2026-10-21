import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { FaRegTimesCircle } from "react-icons/fa"
import { VStack } from "styled-system/jsx"
import { GroupRecapCard } from "#/components/groups/group-recap-card"
import { Breadcrumb } from "#/components/ui/breadcrumb"
import { NotFound } from "#/components/ui/not-found"
import { PageHeader } from "#/components/ui/page-header"
import { groupRecapPageQuery } from "#/graphql/groups/queries"

// A recap as its group's members see it, inside the group. Its shareable
// link is /recaps/:token, which sends members here.
export const Route = createFileRoute(
	"/_app/_authed/groups/$groupId/recaps/$token",
)({
	component: RouteComponent,
	staleTime: 0,
	loader: async ({ context, params }) => {
		const data = await context.queryClient.query(
			groupRecapPageQuery(params.token),
		)
		const recap = data.groupRecap ?? null
		// Someone outside the group gets the shareable page, which has the
		// way in. groupId only comes back for a member.
		if (recap && recap.groupId !== params.groupId) {
			throw redirect({
				to: "/recaps/$token",
				params: { token: params.token },
			})
		}
		return {
			title: recap ? `${recap.groupName} · ${recap.weekLabel} recap` : null,
		}
	},
	head: ({ loaderData }) =>
		loaderData?.title ? { meta: [{ title: loaderData.title }] } : {},
})

function RouteComponent() {
	const { groupId, token } = Route.useParams()
	const { data } = useSuspenseQuery(groupRecapPageQuery(token))
	const recap = data.groupRecap

	if (!recap) {
		return (
			<NotFound
				icon={<FaRegTimesCircle size={24} />}
				eyebrowText="Recap"
				heading="This recap doesn't exist"
				subtitle="The link may be wrong. Your group's recaps are all in its Record Book."
				link={{ text: "View your groups", url: "/spaces" }}
			/>
		)
	}

	return (
		<VStack gap="6" alignItems="stretch">
			<Breadcrumb>
				<Breadcrumb.Link to="/spaces">Spaces</Breadcrumb.Link>
				<Breadcrumb.Link to="/groups/$groupId" params={{ groupId }}>
					{recap.groupName}
				</Breadcrumb.Link>
				<Breadcrumb.Current>{recap.weekLabel}</Breadcrumb.Current>
			</Breadcrumb>
			<PageHeader
				title={recap.groupName}
				subtitle={`Weekly recap · ${recap.weekLabel}`}
			/>
			<GroupRecapCard recap={recap} groupName={recap.groupName} />
		</VStack>
	)
}
