import { VStack } from "styled-system/jsx"
import { toIdentity } from "#/lib/identity"
import { pluralize } from "#/lib/pluralize"
import type { SweepEntry } from "./group-highlight-entries"
import { HighlightRow } from "./highlight-row"

export function SweepRows({
	entries,
	compact,
}: {
	entries: SweepEntry[]
	compact?: boolean
}) {
	return (
		<VStack alignItems="stretch" gap="2">
			{entries.map((e) => (
				<HighlightRow
					compact={compact}
					key={`${toIdentity(e.user).id}-${e.league.id}-${e.slateKey}`}
					user={toIdentity(e.user)}
					leagueAbbr={e.league.abbreviation}
					label={e.slateLabel}
					// Under a "sweeps" heading, "swept" and "8 for 8" are both
					// already said. The size of the slate is the part that isn't.
					value={`${e.gameCount}`}
					valueLabel={pluralize(e.gameCount, "game")}
					to={{
						kind: "sweep",
						username: toIdentity(e.user).username,
						league: e.league.slug,
						slateKey: e.slateKey,
					}}
				/>
			))}
		</VStack>
	)
}
