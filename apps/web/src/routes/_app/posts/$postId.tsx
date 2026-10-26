import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { FaRegTimesCircle } from "react-icons/fa"
import { css } from "styled-system/css"
import { match } from "ts-pattern"
import { RedraftPostView } from "#/components/posts/redraft/redraft-post-view"
import { RushmorePostView } from "#/components/posts/rushmore-post-view"
import { NotFound } from "#/components/ui/not-found"
import type { PostPageQuery } from "#/graphql/generated/graphql"
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
			// its prompt is about (a redraft's, its league).
			space: !post
				? null
				: post.group
					? { kind: "group" as const, groupId: post.group.id }
					: match(post)
							.with({ __typename: "RushmorePost" }, (p) =>
								promptSpace(p.prompt),
							)
							.with({ __typename: "RedraftPost" }, (p) =>
								promptSpace({ league: p.prompt.league, team: null }),
							)
							.exhaustive(),
			meta: !post || post.group || post.removed ? null : postMeta(post),
		}
	},
	head: ({ loaderData, params }) => {
		const meta = loaderData?.meta
		if (!meta) return {}
		return pageMeta({
			title: `${meta.title} | Called My Shot`,
			description: meta.description,
			path: `/posts/${params.postId}`,
			image: {
				path: `/share/${meta.kind}/${params.postId}/card.png`,
				alt: meta.alt,
			},
		})
	},
})

// What a shared link to a public post unfurls to.
function postMeta(post: NonNullable<PostPageQuery["post"]>) {
	return match(post)
		.with({ __typename: "RushmorePost" }, (rushmore) => {
			const title = `@${rushmore.author.username}'s Mount Rushmore: ${rushmore.prompt.title}`
			const picks = [...rushmore.picks]
				.sort((a, b) => a.position - b.position)
				.map((pick) => pick.player.name)
				.join(", ")
			return {
				kind: "rushmore" as const,
				title,
				description: `${picks}. Who are yours? Make your own.`,
				alt: `${title}, ${picks}`,
			}
		})
		.with({ __typename: "RedraftPost" }, (redraft) => {
			const title = `@${redraft.author.username}'s redraft of the ${redraft.prompt.title}`
			const top = redraft.picks
				.slice(0, 3)
				.map((pick) => `${pick.slot}. ${pick.player.name}`)
				.join(", ")
			return {
				kind: "redraft" as const,
				title,
				description: `${top}. Who would you take? Redraft it yourself.`,
				alt: `${title}: ${top}`,
			}
		})
		.exhaustive()
}

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
				.with({ __typename: "RedraftPost" }, (redraft) => (
					<RedraftPostView post={redraft} gifsEnabled={data.gifsEnabled} />
				))
				.exhaustive()}
		</div>
	)
}
