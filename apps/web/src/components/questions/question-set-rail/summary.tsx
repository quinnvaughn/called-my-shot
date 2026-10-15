import { HStack } from "styled-system/jsx"
import { formatSigned } from "#/lib/format-number"
import { formatRecord } from "#/lib/game-status"
import type { QuestionSetRailSummary } from "#/lib/question-set-rail"
import { SummaryStat } from "./summary-stat"

// The record and points once anything has settled, the called count before.
export function Summary({ summary }: { summary: QuestionSetRailSummary }) {
	const { calledCount, questionCount, wins, losses, points } = summary
	return (
		<HStack gap="5" alignItems="baseline">
			{wins + losses > 0 ? (
				<>
					<SummaryStat value={formatRecord(wins, losses)} label="Record" />
					<SummaryStat
						value={formatSigned(points, { zeroSign: true })}
						label="Points"
						tone={points >= 0 ? "success" : "danger"}
					/>
				</>
			) : (
				<SummaryStat
					value={`${calledCount} of ${questionCount}`}
					label="Called"
				/>
			)}
		</HStack>
	)
}
