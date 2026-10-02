import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { Box, HStack, VStack } from "styled-system/jsx"

type Props = {
	title: string
	subtitle?: ReactNode
	// Sentence-case body text under the subtitle, for prose the uppercase
	// subtitle line can't carry (e.g. a group's description).
	description?: ReactNode
	// Under the description, for anything that isn't prose: a group's links.
	footer?: ReactNode
	action?: ReactNode
	// Beside the title, before it: a group's logo.
	leading?: ReactNode
}

export function PageHeader({
	title,
	subtitle,
	description,
	footer,
	action,
	leading,
}: Props) {
	const text = (
		// The action's buttons don't wrap their labels, so the text column is
		// the side that has to give on a narrow screen - without minWidth it
		// holds its min-content width and pushes the action off the viewport.
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
			{footer && <Box marginTop="2">{footer}</Box>}
		</VStack>
	)

	return (
		<HStack alignItems="flex-start" justify="space-between" gap="4">
			{leading ? (
				<HStack gap="3" alignItems="center" minWidth="0">
					{leading}
					{text}
				</HStack>
			) : (
				text
			)}
			{action && <Box flexShrink="0">{action}</Box>}
		</HStack>
	)
}
