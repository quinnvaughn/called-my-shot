import { createFileRoute, notFound, redirect } from "@tanstack/react-router"
import { FaRegTimesCircle } from "react-icons/fa"
import { NotFound } from "#/components/ui/not-found"
import { promptPublicAnswerQuery } from "#/graphql/posts/queries"

// The address printed on someone's Rushmore image,
// calledmyshot.com/rushmore/<prompt>/<username>: one person has one public
// Rushmore per prompt, so this finds it and opens its page.
export const Route = createFileRoute("/_app/rushmore/$code/$username")({
	loader: async ({ context, params }) => {
		const data = await context.queryClient.query(
			promptPublicAnswerQuery(params.code, params.username),
		)
		const post = data.prompt?.publicAnswerBy
		if (!post) throw notFound()
		throw redirect({
			to: "/posts/$postId",
			params: { postId: post.id },
			statusCode: 301,
		})
	},
	notFoundComponent: () => (
		<NotFound
			icon={<FaRegTimesCircle size={24} />}
			eyebrowText="Rushmore"
			heading="This Rushmore isn't here"
			subtitle="It was deleted, or that person hasn't made one for this prompt."
			link={{ text: "Back to home", url: "/" }}
		/>
	),
})
