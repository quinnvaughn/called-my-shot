import { VStack } from "styled-system/jsx"
import { toIdentity } from "#/lib/identity"
import { pluralize } from "#/lib/pluralize"
import { entryKey, type StreakEntry, streakTo } from "./group-highlight-entries"
import { HighlightRow } from "./highlight-row"

export function ColdStreakRows({
	entries,
	compact,
}: {
	entries: StreakEntry[]
	compact?: boolean
}) {
	return (
		<VStack alignItems="stretch" gap="2">
			{entries.map((e) => (
				<HighlightRow
					compact={compact}
					key={entryKey(e)}
					user={toIdentity(e.user)}
					leagueAbbr={e.league.abbreviation}
					label={e.familyLabel}
					value={`${e.currentColdLength}`}
					valueLabel={pluralize(e.currentColdLength, "miss", "misses")}
					note={
						e.worstColdLength > e.currentColdLength
							? `Worst ${e.worstColdLength}`
							: undefined
					}
					to={streakTo(e, "cold")}
				/>
			))}
		</VStack>
	)
}
