import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { Card } from "./card"

type Props = {
	heading: string
	body: string
}

export function InfoCard({ heading, body }: Props) {
	return (
		<Card size="sm">
			<Card.Body>
				<VStack alignItems="flex-start" gap="2">
					<h3
						className={css({
							textTransform: "uppercase",
							fontSize: "2xs",
							letterSpacing: "widest",
							color: "fg.muted",
							fontFamily: "mono",
							fontWeight: "semibold",
						})}
					>
						{heading}
					</h3>
					<p
						className={css({
							fontSize: "xs",
							lineHeight: "relaxed",
							color: "fg.body",
						})}
					>
						{body}
					</p>
				</VStack>
			</Card.Body>
		</Card>
	)
}
