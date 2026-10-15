import { HStack, VStack } from "styled-system/jsx"
import { formatNumericDate } from "#/lib/format-date"
import {
	MIN_LOG,
	round,
	type Subject,
	type TeamLabels,
} from "#/lib/stat-context"
import { mutedClass, numberClass } from "./styles"

// A horizontal strip rather than a row per game: five numbers side by side
// are scannable, five table rows are a wall.
export function RecentGamesStrip({
	subject,
	teams,
}: {
	subject: Subject
	teams: TeamLabels
}) {
	if (subject.recentGames.length < MIN_LOG) return null

	return (
		<HStack gap="4" flexWrap="wrap">
			{[...subject.recentGames].reverse().map((game) => {
				const opponent = teams[game.opponentTeamId]
				return (
					<VStack key={game.gameId} gap="0.5" alignItems="flex-start">
						<span className={numberClass}>
							{game.didNotPlay || game.value === null
								? "--"
								: round(game.value)}
						</span>
						<span className={mutedClass}>
							{formatNumericDate(game.date)}
							{opponent ? ` ${game.isHome ? "vs" : "@"} ${opponent}` : ""}
						</span>
					</VStack>
				)
			})}
		</HStack>
	)
}
