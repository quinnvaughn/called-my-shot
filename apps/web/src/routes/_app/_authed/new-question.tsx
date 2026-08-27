import { useMutation } from "@apollo/client/react"
import { createFileRoute, useRouteContext } from "@tanstack/react-router"
import { useState } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { CreateQuestionForm } from "#/components/questions/create-question/create-question-form"
import { Button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { PageHeader } from "#/components/ui/page-header"
import { SportsDocument } from "#/graphql/queries/sports"
import { ResendEmailChangeDocument } from "#/graphql/queries/user"

export const Route = createFileRoute("/_app/_authed/new-question")({
	component: RouteComponent,
	// Set when arriving from the admin Slates builder's "+ New Question"
	// button - locks the create-question form's slate field to this one
	// rather than making the admin re-search for it (see slate-field.tsx).
	validateSearch: (search: Record<string, unknown>): { slateId?: string } => ({
		...(typeof search.slateId === "string" ? { slateId: search.slateId } : {}),
	}),
	loader: async ({ context }) => {
		const { data } = await context.apolloClient.query({ query: SportsDocument })
		return { sports: data?.sports ?? [] }
	},
})

function VerifyEmailGate() {
	const [resendEmailChange] = useMutation(ResendEmailChangeDocument)
	const [sent, setSent] = useState(false)
	const [error, setError] = useState<string | null>(null)

	async function handleResend() {
		setError(null)
		const { data } = await resendEmailChange({
			variables: { redirectTo: "/new-question" },
		})
		if (data?.resendEmailChange?.__typename !== "User") {
			setError("Couldn't resend. Try again.")
			return
		}
		setSent(true)
	}

	return (
		<HStack justify="center">
			<Card>
				<Card.Body>
					<VStack gap="4" alignItems="center" textAlign="center" padding="4">
						<p className={css({ fontSize: "sm", lineHeight: "relaxed" })}>
							Verify your email before posting a question.
						</p>
						<Button
							variant="solid"
							size="md"
							fullWidth
							disabled={sent}
							onClick={handleResend}
						>
							{sent ? "Confirmation email sent" : "Resend confirmation email"}
						</Button>
						{error && (
							<p className={css({ fontSize: "xs", color: "fg.error" })}>
								{error}
							</p>
						)}
					</VStack>
				</Card.Body>
			</Card>
		</HStack>
	)
}

function SuspendedGate() {
	return (
		<HStack justify="center">
			<Card>
				<Card.Body>
					<p
						className={css({
							fontSize: "sm",
							lineHeight: "relaxed",
							textAlign: "center",
							padding: "4",
						})}
					>
						Your question creation has been suspended. Contact support if you
						think this is a mistake.
					</p>
				</Card.Body>
			</Card>
		</HStack>
	)
}

function RouteComponent() {
	const { sports } = Route.useLoaderData()
	const { slateId } = Route.useSearch()
	const { me } = useRouteContext({ from: "__root__" })

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
					sports={sports}
					isAdmin={me?.isAdmin ?? false}
					lockedSlateId={slateId}
				/>
			)}
		</VStack>
	)
}
