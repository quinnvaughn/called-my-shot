import { VStack } from "styled-system/jsx"
import { toIdentity } from "#/lib/identity"
import { entryKey, type StreakEntry, streakTo } from "./group-highlight-entries"
import { HighlightRow } from "./highlight-row"

export function HotStreakRows({ entries }: { entries: StreakEntry[] }) {
	return (
		<VStack alignItems="stretch" gap="2">
			{entries.map((e) => (
				<HighlightRow
					key={entryKey(e)}
					user={toIdentity(e.user)}
					leagueAbbr={e.league.abbreviation}
					label={e.familyLabel}
					value={`${e.currentLength}`}
					valueLabel="in a row"
					// Only when the run they are on is not their best one. On a row
					// where it is, "Best 8" under an 8 is the same number twice.
					note={
						e.bestLength > e.currentLength ? `Best ${e.bestLength}` : undefined
					}
					to={streakTo(e, "hot")}
				/>
			))}
		</VStack>
	)
}
