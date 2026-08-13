import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { Tag } from "#/components/ui/tag"
import {
	type CallSummaryData,
	convictionSummary,
	pickSummary,
	resultState,
} from "#/lib/call-summary"

type Props = {
	call: CallSummaryData
	// Whose call this is.
	label: string
}

export function PickSummaryRow({ call, label }: Props) {
	const result = resultState(call.totalPoints)

	return (
		<HStack justify="space-between" alignItems="center" gap="3" flexWrap="wrap">
			<span
				className={css({
					fontSize: "xs",
					color: "fg.subtle",
					fontFamily: "mono",
					flex: "1",
					minWidth: "180px",
				})}
			>
				{label} called{" "}
				<span className={css({ color: "fg.default", fontWeight: "medium" })}>
					{pickSummary(call)}
				</span>
			</span>
			<HStack alignItems="center" gap="3" flexShrink="0" marginLeft="auto">
				<span
					className={css({
						fontSize: "xs",
						color: "fg.subtle",
						fontFamily: "mono",
						whiteSpace: "nowrap",
					})}
				>
					{convictionSummary(call)} conviction
				</span>
				{result.status === "pending" ? (
					<Tag>Pending</Tag>
				) : (
					<span
						className={css({
							fontSize: "xs",
							fontFamily: "mono",
							fontWeight: "bold",
							whiteSpace: "nowrap",
							color:
								result.status === "win" ? "success.default" : "danger.default",
						})}
					>
						{result.status === "win" ? "W" : "L"}{" "}
						{result.status === "win" ? "+" : ""}
						{result.points} pts
					</span>
				)}
			</HStack>
		</HStack>
	)
}
