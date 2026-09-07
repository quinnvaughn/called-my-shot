import { createFileRoute, Link } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { useGqlMutation } from "#/graphql/hooks"
import { UnsubscribeFromEmailsDocument } from "#/graphql/queries/user"

// The footer link's destination, for a person rather than a mail provider
// (that's /unsubscribe/one-click). Deliberately outside _authed and _app's
// authed areas: someone acting on an old email is usually signed out, and an
// unsubscribe that first demands a login is one people give up on and report
// as spam instead. The signed token is the credential.
//
// Unsubscribes on load rather than behind a confirm button - the click in the
// email was the intent, and making them click twice is the pattern this is
// supposed to be better than.
export const Route = createFileRoute("/unsubscribe/")({
	component: RouteComponent,
	validateSearch: (search: Record<string, unknown>) => ({
		token: typeof search.token === "string" ? search.token : "",
	}),
})

type Status = "pending" | "success" | "error"

function RouteComponent() {
	const { token } = Route.useSearch()
	const unsubscribe = useGqlMutation(UnsubscribeFromEmailsDocument)
	const [status, setStatus] = useState<Status>("pending")
	const [message, setMessage] = useState<string | null>(null)
	const ranRef = useRef(false)

	useEffect(() => {
		if (ranRef.current) return
		ranRef.current = true

		if (!token) {
			setStatus("error")
			setMessage("This unsubscribe link is missing its token.")
			return
		}

		unsubscribe
			.mutateAsync({ token })
			.then((data) => {
				const result = data?.unsubscribeFromEmails
				if (result?.__typename === "MutationUnsubscribeFromEmailsSuccess") {
					setStatus("success")
					setMessage(
						"You won't get result emails anymore. Account email - verifying your address or confirming a change to it - still sends.",
					)
				} else if (result?.__typename === "ValidationError") {
					setStatus("error")
					setMessage(
						result.fieldErrors?.[0]?.message ??
							"This unsubscribe link is invalid.",
					)
				} else {
					setStatus("error")
					setMessage("Something went wrong. Try again.")
				}
			})
			.catch(() => {
				setStatus("error")
				setMessage("Something went wrong. Try again.")
			})
	}, [token, unsubscribe])

	return (
		<VStack alignItems="center" justify="center" minHeight="60vh" gap="6">
			<Card size="lg">
				<Card.Body>
					<VStack alignItems="center" gap="3" textAlign="center">
						<h1 className={css({ fontFamily: "heading", fontSize: "xl" })}>
							{status === "pending" && "Unsubscribing…"}
							{status === "success" && "Unsubscribed"}
							{status === "error" && "Couldn't unsubscribe you"}
						</h1>
						{message && (
							<p className={css({ fontSize: "sm", color: "fg.muted" })}>
								{message}
							</p>
						)}
						{status !== "pending" && (
							<Link
								to="/settings"
								className={button({ variant: "solid", size: "sm" })}
							>
								Manage email settings
							</Link>
						)}
					</VStack>
				</Card.Body>
			</Card>
		</VStack>
	)
}
