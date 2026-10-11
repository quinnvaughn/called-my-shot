import { SEASON_PLAY_WEEK_MIN_CALLS } from "@called-my-shot/scoring"
import { css } from "styled-system/css"

type Props = {
	play: { weeksPlayed: number; weeksCounted: number; weight: number }
	league: string
}

const weeks = (count: number) => (count === 1 ? "week" : "weeks")

// What a season-long call is worth at the viewer's pace so far, and what
// moves it - see seasonPlayWeight. Sits under the points it already scales.
export function SeasonPlayNote({ play, league }: Props) {
	const rule = `A week counts once you make ${SEASON_PLAY_WEEK_MIN_CALLS} ${league} game calls in it.`
	const text =
		play.weeksCounted === 0
			? `Season-long calls count in full for players who make ${league} calls most weeks. ${rule}`
			: play.weight >= 1
				? `You've made ${league} calls in ${play.weeksPlayed} of the ${play.weeksCounted} ${weeks(play.weeksCounted)} so far, so this counts in full. Skipped weeks would shrink it. ${rule}`
				: `You've made ${league} calls in ${play.weeksPlayed} of the ${play.weeksCounted} ${weeks(play.weeksCounted)} so far, so this counts for ${Math.round(play.weight * 100)}% of its points. Playing more weeks grows it, and skipped weeks shrink it. ${rule}`
	return (
		<span
			className={css({
				fontSize: "2xs",
				color: "fg.subtle",
				lineHeight: "snug",
			})}
		>
			{text} It's set when the question resolves.
		</span>
	)
}
