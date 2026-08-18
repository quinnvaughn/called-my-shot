import { FaQuoteLeft } from "react-icons/fa6"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"

type Props = {
	text: string
	// "The case" (a caller's own reasoning) is the default and by far the
	// most common use - resolution notes reuse the same quoted-comment
	// treatment with a different label rather than a separate component.
	label?: string
}

export function CaseBlock({ text, label = "The case" }: Props) {
	return (
		<HStack
			gap="2"
			alignItems="flex-start"
			className={css({
				background: "bg.subtle",
				borderLeft: "2px solid {colors.border.default}",
				borderRadius: "0 md md 0",
				padding: "2.5",
			})}
		>
			<FaQuoteLeft
				size={11}
				className={css({
					color: "fg.subtle",
					flexShrink: "0",
					marginTop: "0.5",
				})}
			/>
			<VStack gap="0.5" alignItems="flex-start">
				<span
					className={css({
						fontFamily: "mono",
						fontSize: "3xs",
						letterSpacing: "wide",
						textTransform: "uppercase",
						color: "fg.subtle",
					})}
				>
					{label}
				</span>
				<span
					className={css({
						fontSize: "xs",
						color: "fg.body",
						lineHeight: "relaxed",
					})}
				>
					{text}
				</span>
			</VStack>
		</HStack>
	)
}
