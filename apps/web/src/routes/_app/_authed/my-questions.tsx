import { createFileRoute } from "@tanstack/react-router"
import { VStack } from "styled-system/jsx"
import { MyQuestionsTab } from "#/components/my-questions/my-questions-tab"
import { PageHeader } from "#/components/ui/page-header"
import { myQuestionsQuery } from "#/graphql/queries/my-questions"

export const Route = createFileRoute("/_app/_authed/my-questions")({
	component: RouteComponent,
	loader: ({ context }) =>
		context.queryClient.infiniteQuery(myQuestionsQuery()),
})

function RouteComponent() {
	return (
		<VStack alignItems="stretch" gap="6">
			<PageHeader
				title="My Questions"
				subtitle="Every question you've posted"
			/>
			<MyQuestionsTab />
		</VStack>
	)
}
