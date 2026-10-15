import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"

export function DangerRow({
	title,
	description,
	action,
}: {
	title: string
	description: string
	action: ReactNode
}) {
	return (
		<HStack justify="space-between" alignItems="center" gap="4">
			<VStack gap="0.5" alignItems="flex-start">
				<span className={css({ fontWeight: "semibold", fontSize: "sm" })}>
					{title}
				</span>
				<span
					className={css({
						fontSize: "xs",
						color: "fg.muted",
						maxWidth: "38ch",
					})}
				>
					{description}
				</span>
			</VStack>
			{action}
		</HStack>
	)
}
