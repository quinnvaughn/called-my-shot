import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Eyebrow } from "#/components/ui/eyebrow"

// One thing the demo's group did today. `swatch` is the arcade game's own
// color, so the panel reads as that game the way its card does.
export function GroupDayPanel({
	title,
	swatch,
	children,
}: {
	title: string
	swatch?: "season" | "rank"
	children: ReactNode
}) {
	return (
		<VStack
			gap="2"
			alignItems="stretch"
			className={css({
				backgroundColor: "bg.subtle",
				borderRadius: "md",
				padding: "3",
			})}
		>
			<HStack gap="2">
				{swatch && (
					<span
						className={css({
							width: "2.5",
							height: "2.5",
							borderRadius: "sm",
							flexShrink: 0,
							bg: swatch === "season" ? "season.default" : "rank.default",
						})}
					/>
				)}
				<Eyebrow variant="neutral" size="sm">
					{title}
				</Eyebrow>
			</HStack>
			{children}
		</VStack>
	)
}
