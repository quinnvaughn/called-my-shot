import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { RecordStat } from "#/components/records/record-stat"
import { formatSigned } from "#/lib/format-number"

// What a run or a sweep added up to, at the call page's Final scale. With a
// bonus, the big number is the total actually gained and the line under it
// splits it, so two big numbers side by side never read as alternatives.
export function PointsTotal({
	callPoints,
	bonus,
	bonusLabel,
	label,
}: {
	callPoints: number
	bonus: number
	// "streak bonus", "sweep bonus"
	bonusLabel: string
	// What the number is called with no bonus to add: "Run points", "Points".
	label: string
}) {
	const total = callPoints + bonus
	return (
		<VStack gap="1.5" alignItems="flex-start">
			<RecordStat
				value={formatSigned(total, { zeroSign: true })}
				label={bonus > 0 ? "Total points" : label}
				tone={total >= 0 ? "success" : "danger"}
			/>
			{bonus > 0 && (
				<span
					className={css({
						textStyle: "metaLg",
						color: "fg.subtle",
					})}
				>
					{formatSigned(callPoints, { zeroSign: true })} from calls · +{bonus}{" "}
					{bonusLabel}
				</span>
			)}
		</VStack>
	)
}
