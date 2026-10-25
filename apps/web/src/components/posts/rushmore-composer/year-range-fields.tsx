import { RUSHMORE_YEAR_MIN } from "@called-my-shot/schemas"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { FieldLabel } from "#/components/ui/field-label"
import { YearPicker } from "#/components/ui/year-picker"

// A played-between range of years, either end left empty to leave it open.
// Each end can't pass the other.
export function YearRangeFields({
	from,
	to,
	onFromChange,
	onToChange,
}: {
	from: number | null
	to: number | null
	onFromChange: (year: number | null) => void
	onToChange: (year: number | null) => void
}) {
	const thisYear = new Date().getFullYear()
	return (
		<HStack gap="3" alignItems="flex-start">
			<VStack gap="1.5" alignItems="stretch" className={half}>
				<FieldLabel>Played from (optional)</FieldLabel>
				<YearPicker
					aria-label="Played from"
					placeholder="Any year"
					value={from}
					onValueChange={onFromChange}
					min={RUSHMORE_YEAR_MIN}
					max={to ?? thisYear}
				/>
			</VStack>
			<VStack gap="1.5" alignItems="stretch" className={half}>
				<FieldLabel>Through (optional)</FieldLabel>
				<YearPicker
					aria-label="Through"
					placeholder="Any year"
					value={to}
					onValueChange={onToChange}
					min={from ?? RUSHMORE_YEAR_MIN}
					max={thisYear}
				/>
			</VStack>
		</HStack>
	)
}

// Two fields side by side, sharing the row.
const half = css({ flex: 1, minWidth: 0 })
