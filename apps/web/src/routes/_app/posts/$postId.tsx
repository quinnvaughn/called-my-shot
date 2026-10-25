import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { FaRegTimesCircle } from "react-icons/fa"
import { css } from "styled-system/css"
import { match } from "ts-pattern"
import { RushmorePostView } from "#/components/posts/rushmore-post-view"
import { NotFound } from "#/components/ui/not-found"
import { postPageQuery } from "#/graphql/posts/queries"
import { pageMeta } from "#/lib/meta"
import { promptSpace } from "#/lib/prompt-space"

// Public for a public post, so a shared link opens for anyone. A group's
// post reads as missing to anyone outside the group.
export const Route = createFileRoute("/_app/posts/$postId")({
	component: RouteComponent,
	loader: async ({ context, params }) => {
		const data = await context.queryClient.query(postPageQuery(params.postId))
		const post = data.post
		return {
			// A group's post lives in the group; a public one sits in the space
			// its prompt is about.
			space: !post
				? null
				: post.group
					? { kind: "group" as const, groupId: post.group.id }
					: promptSpace(post.prompt),
			meta:
				post?.__typename === "RushmorePost" && !post.group && !post.removed
					? {
							title: post.prompt.title,
							author: post.author.username,
							picks: [...post.picks]
								.sort((a, b) => a.position - b.position)
								.map((pick) => pick.player.name),
						}
					: null,
		}
	},
	head: ({ loaderData, params }) => {
		const meta = loaderData?.meta
		if (!meta) return {}
		return pageMeta({
			title: `@${meta.author}'s Mount Rushmore: ${meta.title} | Called My Shot`,
			description: `${meta.picks.join(", ")}. Who are yours? Make your own.`,
			path: `/posts/${params.postId}`,
			image: {
				path: `/share/rushmore/${params.postId}/card.png`,
				alt: `@${meta.author}'s Mount Rushmore: ${meta.title}, ${meta.picks.join(", ")}`,
			},
		})
	},
})

function RouteComponent() {
	const { postId } = Route.useParams()
	const { data } = useSuspenseQuery(postPageQuery(postId))
	const post = data.post

	if (!post) {
		return (
			<NotFound
				icon={<FaRegTimesCircle size={24} />}
				eyebrowText="Post"
				heading="This post isn't here"
				subtitle="It was deleted, or it was posted in a group you're not in."
				link={{ text: "Back to home", url: "/" }}
			/>
		)
	}

	return (
		<div className={css({ paddingTop: "6" })}>
			{match(post)
				.with({ __typename: "RushmorePost" }, (rushmore) => (
					<RushmorePostView post={rushmore} gifsEnabled={data.gifsEnabled} />
				))
				.exhaustive()}
		</div>
	)
}
