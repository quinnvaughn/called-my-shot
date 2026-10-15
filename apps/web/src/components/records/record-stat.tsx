import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"

type RecordStatTone = "success" | "danger"

const recordStatValueClassByTone: Record<RecordStatTone, string> = {
	success: css({
		fontFamily: "mono",
		fontSize: "2xl",
		fontWeight: "bold",
		lineHeight: "1",
		color: "success.default",
	}),
	danger: css({
		fontFamily: "mono",
		fontSize: "2xl",
		fontWeight: "bold",
		lineHeight: "1",
		color: "danger.default",
	}),
}

export function RecordStat({
	value,
	label,
	tone,
}: {
	value: string
	label: string
	tone: RecordStatTone
}) {
	return (
		<VStack gap="1.5" alignItems="flex-start">
			<span className={recordStatValueClassByTone[tone]}>{value}</span>
			<span
				className={css({
					textStyle: "label",
					color: "fg.muted",
				})}
			>
				{label}
			</span>
		</VStack>
	)
}
