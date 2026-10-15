import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { VStack } from "styled-system/jsx"
import { z } from "zod"
import { CreateQuestionForm } from "#/components/questions/create-question/create-question-form"
import { SuspendedGate } from "#/components/questions/create-question/suspended-gate"
import { VerifyEmailGate } from "#/components/questions/create-question/verify-email-gate"
import { PageHeader } from "#/components/ui/page-header"
import { gqlQueryOptions } from "#/graphql/query-options"
import { SportsDocument } from "#/graphql/sports/catalog/queries"
import { useMe } from "#/hooks/use-me"

const sportsQuery = gqlQueryOptions(SportsDocument, {})

export const Route = createFileRoute("/_app/_authed/new-question")({
	component: RouteComponent,
	// Set when arriving from the admin Ballots builder's "+ New Question"
	// button - locks the create-question form's ballot field to this one
	// rather than making the admin re-search for it (see ballot-field.tsx).
	validateSearch: z.object({
		ballotId: z.string().optional().catch(undefined),
	}),
	loader: ({ context }) => context.queryClient.query(sportsQuery),
})

function RouteComponent() {
	const { data } = useSuspenseQuery(sportsQuery)
	const sports = data.sports
	const { ballotId } = Route.useSearch()
	const me = useMe()

	return (
		<VStack gap="6" alignItems="stretch">
			<PageHeader
				title="Create a question"
				subtitle="Same flow whether you're posting for the group or marking something official."
			/>
			{me && !me.emailVerified ? (
				<VerifyEmailGate />
			) : me && !me.questionCreationEnabled ? (
				<SuspendedGate />
			) : (
				<CreateQuestionForm
					// The locked ballot is part of the form's starting values,
					// so a different one starts a fresh form.
					key={ballotId ?? ""}
					sports={sports}
					isAdmin={me?.isAdmin ?? false}
					lockedBallotId={ballotId}
				/>
			)}
		</VStack>
	)
}
