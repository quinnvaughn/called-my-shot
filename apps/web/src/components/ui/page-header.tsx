import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { Box, HStack, VStack } from "styled-system/jsx"

type Props = {
	title: string
	subtitle?: ReactNode
	// Sentence-case body text under the subtitle, for prose the uppercase
	// subtitle line can't carry.
	description?: ReactNode
	action?: ReactNode
}

export function PageHeader({ title, subtitle, description, action }: Props) {
	return (
		<HStack alignItems="flex-start" justify="space-between" gap="4">
			{/* The action's buttons don't wrap their labels, so the text column is
			    the side that has to give on a narrow screen - without minWidth it
			    holds its min-content width and pushes the action off the viewport. */}
			<VStack gap="1" alignItems="flex-start" minWidth="0">
				<h1
					className={css({
						fontSize: "3xl",
						fontFamily: "heading",
						lineHeight: "1",
						overflowWrap: "anywhere",
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
			{action && <Box flexShrink="0">{action}</Box>}
		</HStack>
	)
}
