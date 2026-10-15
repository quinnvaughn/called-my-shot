import { HStack, VStack } from "styled-system/jsx"
import { formatNumericDate } from "#/lib/format-date"
import {
	MATCHUP_RESULTS,
	type MatchupSide,
	OUTCOME_LETTER,
} from "#/lib/stat-context"
import { mutedClass, numberClass, tileLabelClass } from "./styles"

// The team's own results, in the same strip RecentGamesStrip uses for a stat line.
// The opponent comes off the row rather than a lookup: a team's schedule runs
// through teams this game has nothing to do with.
//
// One result is enough here, where a stat line needs MIN_LOG. That threshold
// is there because a one-game strip restates the headline above it, and this
// card's headline gates out at exactly that point - so in the case where the
// strip stands alone, it is the only thing left that says anything.
export function ResultStrip({
	results,
}: {
	results: MatchupSide["recentResults"]
}) {
	const shown = results.slice(0, MATCHUP_RESULTS)
	if (shown.length === 0) return null

	return (
		<VStack gap="1.5" alignItems="stretch">
			{/* Said outright, because the figures above are measured over the
			    whole season and these are not - without it the strip reads as
			    the season's games, and a team that has played 150 of them
			    appears to have played five. Counted from what is actually
			    shown, so a side with three games says three. */}
			<span className={tileLabelClass}>
				{shown.length === 1 ? "last game" : `last ${shown.length}`}
			</span>
			<HStack gap="4" flexWrap="wrap">
				{[...shown].reverse().map((result) => (
					<VStack key={result.gameId} gap="0.5" alignItems="flex-start">
						<span className={numberClass}>
							{`${OUTCOME_LETTER[result.outcome]} ${result.pointsFor}-${result.pointsAgainst}`}
						</span>
						<span className={mutedClass}>
							{`${formatNumericDate(result.date)} ${result.isHome ? "vs" : "@"} ${result.opponentAbbreviation}`}
						</span>
					</VStack>
				))}
			</HStack>
		</VStack>
	)
}
