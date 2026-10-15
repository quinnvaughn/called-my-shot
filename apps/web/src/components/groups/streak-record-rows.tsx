import { VStack } from "styled-system/jsx"
import { toIdentity } from "#/lib/identity"
import { entryKey, type StreakEntry, streakTo } from "./group-highlight-entries"
import { HighlightRow } from "./highlight-row"

// The group's longest runs ever, shown in the hot list's place when nobody is
// on one now. These are history, so they lead with the best length and don't
// claim anything about right now.
export function StreakRecordRows({ entries }: { entries: StreakEntry[] }) {
	return (
		<VStack alignItems="stretch" gap="2">
			{entries.map((e) => (
				<HighlightRow
					key={entryKey(e)}
					user={toIdentity(e.user)}
					leagueAbbr={e.league.abbreviation}
					label={e.familyLabel}
					value={`${e.bestLength}`}
					valueLabel="in a row"
					to={streakTo(e, "hot")}
				/>
			))}
		</VStack>
	)
}
