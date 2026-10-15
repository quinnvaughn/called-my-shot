import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"

export function ExampleCard({
	label,
	rows,
	note,
}: {
	label: string
	rows: { term: string; expr: ReactNode }[]
	note?: string
}) {
	return (
		<VStack
			alignItems="stretch"
			gap="2.5"
			className={css({
				background: "bg.canvas",
				border: "1px solid {colors.border.default}",
				borderRadius: "lg",
				padding: "3.5",
			})}
		>
			<span
				className={css({
					textStyle: "label",
					color: "fg.subtle",
				})}
			>
				{label}
			</span>
			{rows.map((row) => (
				<HStack key={row.term} justify="space-between" gap="3" fontSize="xs">
					<span
						className={css({
							textStyle: "meta",
							color: "fg.subtle",
							flexShrink: 0,
						})}
					>
						{row.term}
					</span>
					<span
						className={css({
							textStyle: "metaLg",
							color: "fg.default",
							textAlign: "right",
						})}
					>
						{row.expr}
					</span>
				</HStack>
			))}
			{note && (
				<span
					className={css({
						textStyle: "meta",
						color: "fg.subtle",
					})}
				>
					{note}
				</span>
			)}
		</VStack>
	)
}
