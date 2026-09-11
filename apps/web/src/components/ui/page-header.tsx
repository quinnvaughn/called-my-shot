import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"

type Props = {
	title: string
	subtitle?: ReactNode
	// Sentence-case body text under the subtitle, for prose the uppercase
	// subtitle line can't carry (e.g. a group's description).
	description?: ReactNode
	action?: ReactNode
}

export function PageHeader({ title, subtitle, description, action }: Props) {
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
				{description && (
					<p
						className={css({
							marginTop: "1",
							fontSize: "sm",
							color: "fg.muted",
							lineHeight: "relaxed",
						})}
					>
						{description}
					</p>
				)}
			</VStack>
			{action}
		</HStack>
	)
}
