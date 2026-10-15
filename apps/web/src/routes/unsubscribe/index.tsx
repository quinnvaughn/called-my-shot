import { createFileRoute, Link } from "@tanstack/react-router"
import { useEffect, useRef } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { match, P } from "ts-pattern"
import { z } from "zod"
import { button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { useGqlMutation } from "#/graphql/hooks"
import { UnsubscribeFromEmailsDocument } from "#/graphql/user/settings/mutations"

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
	validateSearch: z.object({ token: z.string().catch("") }),
})

type Status = "pending" | "success" | "error"

function RouteComponent() {
	const { token } = Route.useSearch()
	const unsubscribe = useGqlMutation(UnsubscribeFromEmailsDocument)
	const { mutate } = unsubscribe
	const ranRef = useRef(false)

	useEffect(() => {
		if (ranRef.current || !token) return
		ranRef.current = true
		mutate({ token })
	}, [token, mutate])

	const { status, message } = match(unsubscribe)
		.returnType<{ status: Status; message: string | null }>()
		.when(
			() => !token,
			() => ({
				status: "error",
				message: "This unsubscribe link is missing its token.",
			}),
		)
		.with({ status: "success" }, ({ data }) =>
			match(data?.unsubscribeFromEmails)
				.returnType<{ status: Status; message: string | null }>()
				.with({ __typename: "MutationUnsubscribeFromEmailsSuccess" }, () => ({
					status: "success",
					message:
						"You won't get result emails anymore. Account email - verifying your address or confirming a change to it - still sends.",
				}))
				.with({ __typename: "ValidationError" }, (result) => ({
					status: "error",
					message:
						result.fieldErrors?.[0]?.message ??
						"This unsubscribe link is invalid.",
				}))
				.otherwise(() => ({
					status: "error",
					message: "Something went wrong. Try again.",
				})),
		)
		.with({ status: "error" }, () => ({
			status: "error",
			message: "Something went wrong. Try again.",
		}))
		.with({ status: P.union("idle", "pending") }, () => ({
			status: "pending",
			message: null,
		}))
		.exhaustive()

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
