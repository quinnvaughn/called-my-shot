import { createFileRoute, Link } from "@tanstack/react-router"
import { useEffect, useRef } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { match, P } from "ts-pattern"
import { z } from "zod"
import { button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { useGqlMutation } from "#/graphql/hooks"
import { ConfirmEmailChangeDocument } from "#/graphql/user/settings/mutations"
import { track } from "#/lib/analytics"

export const Route = createFileRoute("/_app/confirm-email")({
	component: RouteComponent,
	validateSearch: z.object({
		token: z.string().catch(""),
		redirect: z.string().catch("/settings"),
	}),
})

type Status = "pending" | "success" | "error"

function RouteComponent() {
	const { token, redirect } = Route.useSearch()
	const confirmEmailChange = useGqlMutation(ConfirmEmailChangeDocument, {
		onSuccess: (data) => {
			if (data?.confirmEmailChange?.__typename === "User") {
				track("email_confirmed", {})
			}
		},
	})
	const { mutate } = confirmEmailChange
	const ranRef = useRef(false)

	useEffect(() => {
		if (ranRef.current || !token) return
		ranRef.current = true
		mutate({ token })
	}, [token, mutate])

	const { status, message } = match(confirmEmailChange)
		.returnType<{ status: Status; message: string | null }>()
		.when(
			() => !token,
			() => ({
				status: "error",
				message: "This confirmation link is missing its token.",
			}),
		)
		.with({ status: "success" }, ({ data }) =>
			match(data?.confirmEmailChange)
				.returnType<{ status: Status; message: string | null }>()
				.with({ __typename: "User" }, (result) => ({
					status: "success",
					message: `Your email is now ${result.email}.`,
				}))
				.with({ __typename: "ValidationError" }, (result) => ({
					status: "error",
					message:
						result.fieldErrors?.[0]?.message ??
						"This confirmation link is invalid or expired.",
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
								to={redirect}
								className={button({ variant: "solid", size: "sm" })}
							>
								Continue
							</Link>
						)}
					</VStack>
				</Card.Body>
			</Card>
		</VStack>
	)
}
