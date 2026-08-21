import { createFileRoute } from "@tanstack/react-router"
import { VStack } from "styled-system/jsx"
import { MyQuestionsTab } from "#/components/my-questions/my-questions-tab"
import { PageHeader } from "#/components/ui/page-header"
import { MyQuestionsPageDocument } from "#/graphql/queries/my-questions"

export const Route = createFileRoute("/_app/_authed/my-questions")({
	component: RouteComponent,
	loader: async ({ context }) => {
		const { data } = await context.apolloClient.query({
			query: MyQuestionsPageDocument,
		})
		return {
			myQuestions: data?.myQuestions ?? {
				items: [],
				pageInfo: { hasNextPage: false, endCursor: null },
			},
		}
	},
})

function RouteComponent() {
	const { myQuestions } = Route.useLoaderData()
	return (
		<VStack alignItems="stretch" gap="6">
			<PageHeader
				title="My Questions"
				subtitle="Every question you've posted"
			/>
			<MyQuestionsTab
				initialItems={myQuestions.items}
				initialPageInfo={myQuestions.pageInfo}
			/>
		</VStack>
	)
}
