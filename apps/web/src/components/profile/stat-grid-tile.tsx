import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Card } from "#/components/ui/card"
import { InfoTip } from "#/components/ui/info-tip"
import type { StatGridItem } from "#/lib/stat-grid"

export function StatGridTile({ item }: { item: StatGridItem }) {
	return (
		<Card size="sm" variant="surface">
			<Card.Body>
				<VStack gap="0.5" alignItems="stretch">
					{/* The tip rides the value's row, so a label that wraps
					    in a narrow tile doesn't drag the icon down with it. */}
					<HStack justify="space-between" alignItems="center" gap="2">
						{item.hint ? (
							<span
								className={css({
									fontFamily: "mono",
									fontSize: "xs",
									letterSpacing: "wide",
									color: "fg.subtle",
								})}
							>
								{item.hint}
							</span>
						) : (
							<span className={css({ fontFamily: "heading", fontSize: "lg" })}>
								{item.value}
							</span>
						)}
						<InfoTip label={item.label} text={item.description} />
					</HStack>
					<span
						className={css({
							textStyle: "labelSm",
							color: "fg.subtle",
						})}
					>
						{item.label}
					</span>
				</VStack>
			</Card.Body>
		</Card>
	)
}
