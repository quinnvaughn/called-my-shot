import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { CallTimestamp } from "#/components/questions/call-timestamp"

export function RedoLine({
	label,
	at,
	pick,
	struck,
}: {
	label: string
	at: string
	pick: string
	struck?: boolean
}) {
	return (
		<HStack gap="3" alignItems="baseline" justify="space-between">
			<HStack gap="2.5" alignItems="baseline">
				<span
					className={css({
						textStyle: "labelSm",
						color: "fg.subtle",
						minWidth: "5.5rem",
					})}
				>
					{label}
				</span>
				<span
					className={
						struck
							? css({
									fontWeight: "semibold",
									color: "fg.subtle",
									textDecoration: "line-through",
								})
							: css({ fontWeight: "semibold", color: "fg.default" })
					}
				>
					{pick}
				</span>
			</HStack>
			<span
				className={css({
					textStyle: "metaSm",
					color: "fg.subtle",
					whiteSpace: "nowrap",
				})}
			>
				<CallTimestamp iso={at} />
			</span>
		</HStack>
	)
}
