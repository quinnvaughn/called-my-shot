import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"

type Props = {
	title: string
	subtitle?: ReactNode
	action?: ReactNode
}

export function PageHeader({ title, subtitle, action }: Props) {
	return (
		<HStack alignItems="flex-start" justify="space-between" gap="4">
			<VStack gap="1" alignItems="flex-start">
				<h1
					className={css({
						fontSize: "3xl",
						fontFamily: "heading",
						lineHeight: "1",
					})}
				>
					{title}
				</h1>
				{subtitle && (
					<p
						className={css({
							fontFamily: "mono",
							fontSize: "xs",
							color: "fg.muted",
							textTransform: "uppercase",
						})}
					>
						{subtitle}
					</p>
				)}
			</VStack>
			{action}
		</HStack>
	)
}
