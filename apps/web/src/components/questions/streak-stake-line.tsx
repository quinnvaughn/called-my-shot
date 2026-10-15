import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { streakStakeText } from "#/lib/streak-meta"
import { StreakTag } from "./streak-tag"

type Props = {
	leagueAbbr: string
	stake: { familyLabel: string; currentLength: number; bestLength: number }
}

// Above the pick form on a question that counts toward one of the viewer's
// live streaks, so the call is made knowing what it can end or extend.
export function StreakStakeLine({ leagueAbbr, stake }: Props) {
	const track = `${leagueAbbr} ${stake.familyLabel}`
	return (
		<HStack gap="2" alignItems="center">
			<StreakTag length={stake.currentLength} track={track} />
			<span
				className={css({
					textStyle: "meta",
					color: "fg.muted",
				})}
			>
				{streakStakeText({
					track,
					currentLength: stake.currentLength,
					bestLength: stake.bestLength,
				})}
			</span>
		</HStack>
	)
}
