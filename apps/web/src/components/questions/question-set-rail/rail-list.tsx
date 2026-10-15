import { css, cx } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { Card } from "#/components/ui/card"
import type { QuestionSetRailRow } from "#/lib/question-set-rail"
import { sectionRuns } from "#/lib/section-runs"
import { RailRow } from "./rail-row"
import { subtleLabelClass } from "./rail-styles"

export function RailList({
	rows,
	currentQuestionId,
}: {
	rows: QuestionSetRailRow[]
	currentQuestionId?: string
}) {
	if (rows.length === 0) return null
	return (
		<Card variant="surface">
			<VStack gap="0" alignItems="stretch" paddingBlock="1">
				{sectionRuns(rows).map((run, i) => (
					<VStack
						// biome-ignore lint/suspicious/noArrayIndexKey: a section can repeat across runs, the position can't
						key={`${run.section}-${i}`}
						gap="0"
						alignItems="stretch"
					>
						{run.section && (
							<span
								className={cx(
									subtleLabelClass,
									css({
										paddingInline: "4",
										paddingTop: "3",
										paddingBottom: "1",
									}),
								)}
							>
								{run.section}
							</span>
						)}
						{run.entries.map(({ item: row }) => (
							<RailRow
								key={row.questionId}
								row={row}
								isCurrent={row.questionId === currentQuestionId}
							/>
						))}
					</VStack>
				))}
			</VStack>
		</Card>
	)
}
