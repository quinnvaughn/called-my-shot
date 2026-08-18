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
}

// Who made the call is shown separately, above this (see CallIdentityRow) -
// this is just the pick itself and what it's worth, not "who called it"
// again.
export function PickSummaryRow({ call }: Props) {
	const result = resultState(call.totalPoints)

	return (
		<HStack justify="space-between" alignItems="center" gap="3" flexWrap="wrap">
			<span
				className={css({
					fontSize: "sm",
					color: "fg.muted",
					flex: "1",
					minWidth: "180px",
				})}
			>
				Called{" "}
				<span className={css({ color: "fg.default", fontWeight: "bold" })}>
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
							padding: "{spacing.1} {spacing.2.5}",
							borderRadius: "sm",
							color:
								result.status === "win" ? "success.default" : "danger.default",
							backgroundColor:
								result.status === "win" ? "success.subtle" : "danger.subtle",
						})}
					>
						{result.status === "win" ? "+" : ""}
						{result.points} PTS
					</span>
				)}
			</HStack>
		</HStack>
	)
}
