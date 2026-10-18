import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"

type Props = {
	label: string
	value: ReactNode
	// A line under the number, e.g. what it's worth in points.
	note?: string | null
	tone?: "default" | "secondary" | "success" | "danger"
}

// One number in the chain's stakes row.
export function ChainStat({ label, value, note, tone = "default" }: Props) {
	return (
		<VStack
			gap="1"
			alignItems="flex-start"
			className={css({
				flex: "1",
				minWidth: "32",
				padding: "4",
				borderRadius: "lg",
				bg: "bg.surface",
				border: "1px solid {colors.border.default}",
			})}
		>
			<span className={css({ textStyle: "label", color: "fg.muted" })}>
				{label}
			</span>
			<span
				className={css({
					fontFamily: "mono",
					fontSize: "2xl",
					fontWeight: "bold",
					color:
						tone === "secondary"
							? "secondary.default"
							: tone === "success"
								? "success.default"
								: tone === "danger"
									? "danger.default"
									: "fg.default",
				})}
			>
				{value}
			</span>
			{note && (
				<span className={css({ textStyle: "meta", color: "fg.muted" })}>
					{note}
				</span>
			)}
		</VStack>
	)
}
