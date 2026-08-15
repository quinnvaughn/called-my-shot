import { createFileRoute, useRouteContext } from "@tanstack/react-router"
import { VStack } from "styled-system/jsx"
import { CreateQuestionForm } from "#/components/questions/create-question/create-question-form"
import { PageHeader } from "#/components/ui/page-header"
import { SportsDocument } from "#/graphql/queries/sports"

export const Route = createFileRoute("/_app/_authed/new-question")({
	component: RouteComponent,
	loader: async ({ context }) => {
		const { data } = await context.apolloClient.query({ query: SportsDocument })
		return { sports: data?.sports ?? [] }
	},
})

function RouteComponent() {
	const { sports } = Route.useLoaderData()
	const { me } = useRouteContext({ from: "__root__" })

	return (
		<VStack gap="6" alignItems="stretch">
			<PageHeader
				title="Create a question"
				subtitle="Same flow whether you're posting for the group or marking something official."
			/>
			<CreateQuestionForm sports={sports} isAdmin={me?.isAdmin ?? false} />
		</VStack>
	)
}
