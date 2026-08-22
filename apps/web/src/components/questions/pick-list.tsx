import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import {
	type CallSummaryData,
	convictionSummary,
	lossContext,
	pickSummary,
	resultState,
} from "#/lib/call-summary"
import { PickStateIcon } from "./pick-state-icon"

type Props = {
	call: CallSummaryData
}

// One row per pick - player_season_award/team_season_award have up to
// picksRequired independent picks, each with its own result and conviction,
// so those get one PickStateIcon each. Every other shape only ever has the
// one pick, so it renders as a single row mirroring the call's overall
// result (resultState), with conviction as a separate line below rather
// than repeated per-row.
export function PickList({ call }: Props) {
	return match(call.question.shape)
		.with("PLAYER_SEASON_AWARD", "TEAM_SEASON_AWARD", () => (
			<VStack gap="0" alignItems="stretch">
				{call.selections.map((selection) => {
					const state =
						selection.option.isCorrect === null
							? "pending"
							: selection.option.isCorrect
								? "win"
								: "loss"
					return (
						<PickRow key={selection.id} state={state}>
							<span
								className={css({
									fontSize: "lg",
									fontWeight: "bold",
									color: "fg.default",
									textDecoration: state === "loss" ? "line-through" : "none",
									textDecorationColor: "border.default",
								})}
							>
								{selection.option.label}
							</span>
							<span
								className={css({
									marginLeft: "auto",
									fontFamily: "mono",
									fontSize: "3xs",
									color: "fg.subtle",
									flexShrink: "0",
								})}
							>
								{selection.conviction}%
							</span>
						</PickRow>
					)
				})}
			</VStack>
		))
		.with(
			"PLAYER_STAT_OVER_UNDER",
			"TEAM_STAT_OVER_UNDER",
			"PLAYER_SEASON_STAT_OVER_UNDER",
			"TEAM_SEASON_STAT_OVER_UNDER",
			"GAME_TOTAL_OVER_UNDER",
			"PLAYER_STAT_NUMERIC_GUESS",
			"TEAM_STAT_NUMERIC_GUESS",
			"PLAYER_VS_PLAYER",
			"PLAYER_VS_PLAYER_SEASON",
			"TEAM_VS_TEAM",
			"YES_NO_PROP",
			"PLAYER_AWARD_FINALISTS",
			() => {
				const result = resultState(call.totalPoints)
				const context = lossContext(call)
				return (
					<VStack gap="1.5" alignItems="stretch">
						<PickRow state={result.status}>
							<span
								className={css({
									fontSize: "lg",
									fontWeight: "bold",
									color: "fg.default",
								})}
							>
								{pickSummary(call)}
							</span>
						</PickRow>
						<span
							className={css({
								fontFamily: "mono",
								fontSize: "3xs",
								color: "fg.subtle",
								paddingLeft: "6",
							})}
						>
							{convictionSummary(call)} conviction
							{context && ` · ${context}`}
						</span>
					</VStack>
				)
			},
		)
		.exhaustive()
}

function PickRow({
	state,
	children,
}: {
	state: "win" | "loss" | "pending"
	children: React.ReactNode
}) {
	return (
		<div
			className={css({
				display: "flex",
				alignItems: "center",
				gap: "2.5",
				paddingBlock: "1",
			})}
		>
			<PickStateIcon state={state} />
			{children}
		</div>
	)
}
