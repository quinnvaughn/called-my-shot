import { useState } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { useGqlMutation } from "#/graphql/hooks"
import { ResendEmailChangeDocument } from "#/graphql/user/settings/mutations"

export function VerifyEmailGate() {
	const resendEmailChange = useGqlMutation(ResendEmailChangeDocument)
	const [sent, setSent] = useState(false)
	const [error, setError] = useState<string | null>(null)

	async function handleResend() {
		setError(null)
		const data = await resendEmailChange.mutateAsync({
			redirectTo: "/new-question",
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
