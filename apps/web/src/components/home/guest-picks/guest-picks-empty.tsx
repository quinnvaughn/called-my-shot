import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { AuthModal } from "#/components/auth/auth-modal"
import { Button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { Eyebrow } from "#/components/ui/eyebrow"
import { openModal } from "#/stores/modal-store"

// Nothing official is locking soon enough to offer, or the visitor skipped past
// everything there was.
export function GuestPicksEmpty() {
	return (
		<Card variant="surface" size="md">
			<Card.Body>
				<VStack gap="3" alignItems="flex-start">
					<Eyebrow>Next slate</Eyebrow>
					<h2
						className={css({
							fontFamily: "heading",
							fontSize: "lg",
							lineHeight: "snug",
						})}
					>
						Nothing is about to lock right now.
					</h2>
					<p
						className={css({
							fontSize: "sm",
							lineHeight: "relaxed",
							color: "fg.muted",
						})}
					>
						Questions go up ahead of every game, and calling early scores more.
						Sign up and you'll be ready when the next ones post.
					</p>
					<Button
						variant="solid"
						size="md"
						onClick={() => openModal(<AuthModal defaultView="signup" />)}
					>
						Sign up free
					</Button>
				</VStack>
			</Card.Body>
		</Card>
	)
}
