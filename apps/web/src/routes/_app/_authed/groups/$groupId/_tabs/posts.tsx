import { createFileRoute, Link } from "@tanstack/react-router"
import { css, cx } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { PostFeed } from "#/components/posts/post-feed"
import { button } from "#/components/ui/button"
import { EmptyState } from "#/components/ui/empty-state"
import { groupPostsQuery } from "#/graphql/posts/queries"

// Everything posted to this group. These posts stay here and in members'
// Home feeds, never in a league's or team's feed or on a profile.
export const Route = createFileRoute(
	"/_app/_authed/groups/$groupId/_tabs/posts",
)({
	component: RouteComponent,
	loader: ({ context, params }) =>
		context.queryClient.infiniteQuery(groupPostsQuery(params.groupId)),
})

function RouteComponent() {
	const { groupId } = Route.useParams()
	return (
		<VStack gap="4" alignItems="stretch">
			<Link
				to="/rushmore/new"
				search={{ group: groupId }}
				className={cx(
					button({ variant: "solid", size: "sm" }),
					css({ alignSelf: "flex-start" }),
				)}
			>
				Post a Rushmore here
			</Link>
			<PostFeed
				query={groupPostsQuery(groupId)}
				empty={
					<EmptyState>
						Nothing posted in this group yet. A Rushmore posted here is seen
						only by members.
					</EmptyState>
				}
			/>
		</VStack>
	)
}
