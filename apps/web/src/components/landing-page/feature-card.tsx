import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { Card } from "#/components/ui/card"

export type FeatureItem = {
	icon: ReactNode
	title: string
	description: string
	example?: string
}

export function FeatureCard({
	icon,
	title,
	description,
	example,
}: FeatureItem) {
	return (
		<Card>
			<Card.Body>
				<VStack alignItems="flex-start" gap="3.5">
					<div
						className={css({
							width: "9",
							height: "9",
							borderRadius: "lg",
							bg: "primary.subtle",
							color: "primary.default",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							flexShrink: "0",
						})}
					>
						{icon}
					</div>
					<div className={css({ fontWeight: "semibold" })}>{title}</div>
					<div
						className={css({
							color: "fg.muted",
							fontSize: "sm",
							lineHeight: "relaxed",
						})}
					>
						{description}
					</div>
					{example && (
						<div
							className={css({
								textStyle: "metaLg",
								color: "fg.subtle",
								borderTop: "1px solid {border.default}",
								paddingTop: "3",
								width: "full",
							})}
						>
							{example}
						</div>
					)}
				</VStack>
			</Card.Body>
		</Card>
	)
}
