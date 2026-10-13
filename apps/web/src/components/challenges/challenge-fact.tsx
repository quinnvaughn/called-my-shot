import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"

// One labelled number in a challenge's facts row.
export function ChallengeFact({
	label,
	value,
	size = "lg",
	tone = "default",
}: {
	label: string
	value: string
	size?: "md" | "lg"
	tone?: "default" | "success" | "danger"
}) {
	return (
		<VStack gap="1" alignItems="flex-start">
			<span
				className={css({
					fontFamily: "mono",
					fontSize: "2xs",
					letterSpacing: "wide",
					textTransform: "uppercase",
					color: "fg.subtle",
				})}
			>
				{label}
			</span>
			<span
				className={css({
					fontFamily: "heading",
					fontSize: size === "lg" ? "xl" : "md",
					lineHeight: "1",
					color:
						tone === "success"
							? "success.default"
							: tone === "danger"
								? "danger.default"
								: "fg.default",
				})}
			>
				{value}
			</span>
		</VStack>
	)
}
