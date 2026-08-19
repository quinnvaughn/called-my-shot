import { useMutation } from "@apollo/client/react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { ConfirmEmailChangeDocument } from "#/graphql/queries/user"

export const Route = createFileRoute("/_app/confirm-email")({
	component: RouteComponent,
	validateSearch: (search: Record<string, unknown>) => ({
		token: typeof search.token === "string" ? search.token : "",
	}),
})

type Status = "pending" | "success" | "error"

function RouteComponent() {
	const { token } = Route.useSearch()
	const [confirmEmailChange] = useMutation(ConfirmEmailChangeDocument)
	const [status, setStatus] = useState<Status>("pending")
	const [message, setMessage] = useState<string | null>(null)
	const ranRef = useRef(false)

	useEffect(() => {
		if (ranRef.current) return
		ranRef.current = true

		if (!token) {
			setStatus("error")
			setMessage("This confirmation link is missing its token.")
			return
		}

		confirmEmailChange({ variables: { token } })
			.then(({ data }) => {
				const result = data?.confirmEmailChange
				if (result?.__typename === "User") {
					setStatus("success")
					setMessage(`Your email is now ${result.email}.`)
				} else if (result?.__typename === "ValidationError") {
					setStatus("error")
					setMessage(
						result.fieldErrors?.[0]?.message ??
							"This confirmation link is invalid or expired.",
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
	}, [token, confirmEmailChange])

	return (
		<VStack alignItems="center" justify="center" minHeight="60vh" gap="6">
			<Card size="lg">
				<Card.Body>
					<VStack alignItems="center" gap="3" textAlign="center">
						<h1 className={css({ fontFamily: "heading", fontSize: "xl" })}>
							{status === "pending" && "Confirming your email…"}
							{status === "success" && "Email confirmed"}
							{status === "error" && "Couldn't confirm your email"}
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
								Back to settings
							</Link>
						)}
					</VStack>
				</Card.Body>
			</Card>
		</VStack>
	)
}
