// The crown line for a member who holds Player of the Week, null otherwise.
export const crownLabel = (entry: { playerOfTheWeek?: string | null }) =>
	entry.playerOfTheWeek ? `Player of the Week, ${entry.playerOfTheWeek}` : null
