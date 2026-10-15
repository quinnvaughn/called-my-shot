import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { Card } from "#/components/ui/card"

export function SuspendedGate() {
	return (
		<HStack justify="center">
			<Card>
				<Card.Body>
					<p
						className={css({
							fontSize: "sm",
							lineHeight: "relaxed",
							textAlign: "center",
							padding: "4",
						})}
					>
						Your question creation has been suspended. Contact support if you
						think this is a mistake.
					</p>
				</Card.Body>
			</Card>
		</HStack>
	)
}
