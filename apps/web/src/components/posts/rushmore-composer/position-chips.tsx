import { rushmorePositionsFor } from "@called-my-shot/schemas"
import { HStack, VStack } from "styled-system/jsx"
import { ChipButton } from "#/components/ui/chip-button"
import { FieldLabel } from "#/components/ui/field-label"

// The league's positions, any number of them picked. None picked is any
// position.
export function PositionChips({
	leagueAbbreviation,
	value,
	onChange,
}: {
	leagueAbbreviation: string
	value: string[]
	onChange: (positions: string[]) => void
}) {
	const positions = rushmorePositionsFor(leagueAbbreviation)
	if (positions.length === 0) return null
	return (
		<VStack gap="1.5" alignItems="stretch">
			<FieldLabel>Positions (optional)</FieldLabel>
			<HStack gap="1.5" flexWrap="wrap">
				{positions.map((position) => {
					const on = value.includes(position.code)
					return (
						<ChipButton
							key={position.code}
							selected={on}
							pressed={on}
							onClick={() =>
								onChange(
									on
										? value.filter((code) => code !== position.code)
										: positions
												.map((p) => p.code)
												.filter(
													(code) =>
														code === position.code || value.includes(code),
												),
								)
							}
						>
							{position.label}
						</ChipButton>
					)
				})}
			</HStack>
		</VStack>
	)
}
