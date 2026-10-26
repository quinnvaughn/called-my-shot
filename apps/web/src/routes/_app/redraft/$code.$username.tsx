import { createFileRoute, notFound, redirect } from "@tanstack/react-router"
import { FaRegTimesCircle } from "react-icons/fa"
import { NotFound } from "#/components/ui/not-found"
import { redraftPublicAnswerQuery } from "#/graphql/posts/queries"

// The address printed on someone's redraft image,
// calledmyshot.com/redraft/<class>/<username>: one person has one public
// redraft per class, so this finds it and opens its page.
export const Route = createFileRoute("/_app/redraft/$code/$username")({
	loader: async ({ context, params }) => {
		const data = await context.queryClient.query(
			redraftPublicAnswerQuery(params.code, params.username),
		)
		const post = data.redraftPrompt?.publicAnswerBy
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
			eyebrowText="Redraft"
			heading="This redraft isn't here"
			subtitle="It was deleted, or that person hasn't redrafted this class."
			link={{ text: "Back to home", url: "/" }}
		/>
	),
})
