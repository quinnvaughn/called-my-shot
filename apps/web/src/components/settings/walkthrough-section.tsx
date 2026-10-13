import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { useReplayWalkthrough } from "#/hooks/use-replay-walkthrough"

// What makes skipping the walkthrough a free choice: it can always be started
// again, so nobody has to sit through it the first time just in case.
export function WalkthroughSection() {
	const walkthrough = useReplayWalkthrough()
	return (
		<Card>
			<Card.Body>
				<HStack justify="space-between" alignItems="center" gap="4">
					<VStack gap="0.5" alignItems="flex-start">
						<span className={css({ fontWeight: "semibold", fontSize: "sm" })}>
							Replay the walkthrough
						</span>
						<span className={css({ fontSize: "xs", color: "fg.muted" })}>
							Takes you through making a call on an open question, step by step.
						</span>
					</VStack>
					<Button
						variant="dark"
						size="sm"
						loading={walkthrough.pending}
						onClick={() => void walkthrough.replay()}
					>
						Replay
					</Button>
				</HStack>
			</Card.Body>
		</Card>
	)
}
