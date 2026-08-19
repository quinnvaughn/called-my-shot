import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { openModal } from "#/stores/modal-store"
import { DeleteAccountModal } from "./delete-account-modal"

type Props = {
	username: string
}

export function DangerZone({ username }: Props) {
	return (
		<Card>
			<Card.Body>
				<HStack justify="space-between" alignItems="center">
					<VStack gap="0.5" alignItems="flex-start">
						<span className={css({ fontWeight: "semibold", fontSize: "sm" })}>
							Delete account
						</span>
						<span
							className={css({
								fontSize: "xs",
								color: "fg.muted",
								maxWidth: "38ch",
							})}
						>
							Permanently removes your calls, points, and rank. Can't be undone.
						</span>
					</VStack>
					<Button
						variant="outline"
						size="sm"
						onClick={() =>
							openModal(<DeleteAccountModal username={username} />)
						}
						className={css({
							borderColor: "danger.default",
							color: "danger.default",
						})}
					>
						Delete account
					</Button>
				</HStack>
			</Card.Body>
		</Card>
	)
}
