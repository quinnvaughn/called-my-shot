import { HStack } from "styled-system/jsx"
import { ChipButton } from "#/components/ui/chip-button"

type Props = {
	leagues: { id: string; abbreviation: string }[]
	value: string[]
	onChange: (leagueIds: string[]) => void
}

// Shared by group creation and group settings. An empty value is "All
// leagues", deliberately not the same as picking every league one by one: a
// group left on All picks up leagues added to the catalog later.
export function TrackedLeaguesPicker({ leagues, value, onChange }: Props) {
	const selected = new Set(value)
	const tracksAll = value.length === 0

	function toggle(leagueId: string) {
		onChange(
			selected.has(leagueId)
				? value.filter((id) => id !== leagueId)
				: [...value, leagueId],
		)
	}

	return (
		<HStack gap="2" flexWrap="wrap">
			<ChipButton
				selected={tracksAll}
				pressed={tracksAll}
				onClick={() => onChange([])}
			>
				All leagues
			</ChipButton>
			{leagues.map((league) => (
				<ChipButton
					key={league.id}
					selected={selected.has(league.id)}
					pressed={selected.has(league.id)}
					onClick={() => toggle(league.id)}
				>
					{league.abbreviation}
				</ChipButton>
			))}
		</HStack>
	)
}
