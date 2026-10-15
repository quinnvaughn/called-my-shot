import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { VStack } from "styled-system/jsx"
import { z } from "zod"
import { LinkError } from "#/components/auth/link-error"
import { ResetForm } from "#/components/auth/reset-form"
import { Card } from "#/components/ui/card"

export const Route = createFileRoute("/_app/reset-password")({
	component: RouteComponent,
	validateSearch: z.object({ token: z.string().catch("") }),
	head: () => ({
		meta: [
			{ title: "Reset password · Called My Shot" },
			{ name: "robots", content: "noindex" },
			// The token is in this page's URL, so it must not ride along in a
			// Referer header to anything the page loads or links to.
			{ name: "referrer", content: "no-referrer" },
		],
	}),
})

function RouteComponent() {
	const { token } = Route.useSearch()
	// Set once the server rejects the link, which only a fresh one fixes.
	const [linkError, setLinkError] = useState<string | null>(
		token ? null : "This reset link is missing its token.",
	)

	return (
		<VStack alignItems="center" justify="center" minHeight="60vh" gap="6">
			<Card size="lg">
				<Card.Body>
					{linkError ? (
						<LinkError message={linkError} />
					) : (
						<ResetForm token={token} onLinkError={setLinkError} />
					)}
				</Card.Body>
			</Card>
		</VStack>
	)
}
