import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { useRequireAuth } from "#/hooks/use-require-auth"

export function SignUpPrompt() {
	const requireAuth = useRequireAuth()
	return (
		<Card>
			<Card.Body>
				<HStack
					justify="space-between"
					alignItems="center"
					gap="4"
					flexWrap="wrap"
				>
					<span className={css({ fontSize: "sm", color: "fg.body" })}>
						Call games before they start, score points when you're right, and
						see where you rank in your group.
					</span>
					<Button size="sm" onClick={() => requireAuth(() => {})}>
						Sign up
					</Button>
				</HStack>
			</Card.Body>
		</Card>
	)
}
