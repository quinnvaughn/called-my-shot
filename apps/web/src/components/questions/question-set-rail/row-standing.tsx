import { formatPayout } from "#/lib/call-summary"
import { formatSigned } from "#/lib/format-number"
import type { QuestionSetRailRow } from "#/lib/question-set-rail"
import { TONE_COLOR } from "./rail-styles"
import { StandingCell } from "./standing-cell"

export function RowStanding({ row }: { row: QuestionSetRailRow }) {
	const { call, state } = row
	if (!call) return null
	if (state === "won" || state === "lost") {
		const points = call.totalPoints ?? 0
		return (
			<StandingCell
				value={formatSigned(points, { zeroSign: true })}
				tone={points >= 0 ? "success" : "danger"}
			/>
		)
	}
	if (state === "voided") return <StandingCell value="Void" tone="muted" />
	if (row.live) return <StandingCell {...row.live} />
	if (row.questionStatus === "OPEN" && call.payout) {
		const payout = formatPayout(call.payout)
		return (
			<StandingCell
				value={
					<>
						<span className={TONE_COLOR.success}>{payout.win}</span>
						<span className={TONE_COLOR.muted}> / </span>
						<span className={TONE_COLOR.danger}>{payout.lose}</span>
					</>
				}
				tone="default"
			/>
		)
	}
	return null
}
