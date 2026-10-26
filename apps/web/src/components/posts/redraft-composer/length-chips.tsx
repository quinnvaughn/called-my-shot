import { HStack, VStack } from "styled-system/jsx"
import { ChipButton } from "#/components/ui/chip-button"
import { FieldLabel } from "#/components/ui/field-label"

type Props = {
	lengths: { count: number; label: string }[]
	value: number
	onChange: (count: number) => void
}

// How far down the class the redraft goes: the lengths the class offers,
// each saying how many picks it is.
export function LengthChips({ lengths, value, onChange }: Props) {
	return (
		<VStack gap="1.5" alignItems="stretch">
			<FieldLabel>How many picks</FieldLabel>
			<HStack gap="2" flexWrap="wrap">
				{lengths.map((length) => (
					<ChipButton
						key={length.count}
						selected={length.count === value}
						pressed={length.count === value}
						onClick={() => onChange(length.count)}
					>
						{length.label === `Top ${length.count}`
							? length.label
							: `${length.label} · ${length.count} picks`}
					</ChipButton>
				))}
			</HStack>
		</VStack>
	)
}
