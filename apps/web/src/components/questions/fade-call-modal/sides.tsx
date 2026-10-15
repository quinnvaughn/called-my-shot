import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import type { FadeCallModalProps } from "./types"

const sideLabelClass = css({
	textStyle: "label",
	color: "fg.subtle",
})

// The two sides, OP's struck through, so the fixed pick is visible before
// anything is set.
export function Sides({
	opUsername,
	opPickLabel,
	pickLabel,
}: Pick<FadeCallModalProps, "opUsername" | "opPickLabel" | "pickLabel">) {
	return (
		<VStack
			gap="2"
			alignItems="stretch"
			className={css({
				backgroundColor: "bg.canvas",
				borderRadius: "md",
				paddingBlock: "2.5",
				paddingInline: "3.5",
			})}
		>
			<HStack justify="space-between" gap="3">
				<span className={sideLabelClass}>@{opUsername}'s pick</span>
				<span
					className={css({
						fontSize: "sm",
						color: "fg.subtle",
						textDecoration: "line-through",
					})}
				>
					{opPickLabel}
				</span>
			</HStack>
			<HStack justify="space-between" gap="3">
				<span className={sideLabelClass}>Your side</span>
				<span className={css({ fontSize: "sm", fontWeight: "bold" })}>
					{pickLabel}
				</span>
			</HStack>
		</VStack>
	)
}
