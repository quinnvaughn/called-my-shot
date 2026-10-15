import { css } from "styled-system/css"

type Props = {
	stage: { gamesPlayed: number; bestOf: number; weight: number }
}

// What a series call made now is worth, and why - see seriesStageWeight. Sits
// under the points it already scales.
export function SeriesStageNote({ stage }: Props) {
	const { gamesPlayed, bestOf, weight } = stage
	const text =
		gamesPlayed === 0
			? `Before Game 1, a series call counts in full. Each game played takes 1/${bestOf} off what a new one is worth.`
			: `Before Game ${gamesPlayed + 1} of ${bestOf}, a series call counts for ${Math.round(weight * 100)}% of its points, right or wrong. Its price is set from the series score.`
	return (
		<span
			className={css({
				fontSize: "2xs",
				color: "fg.subtle",
				lineHeight: "snug",
			})}
		>
			{text}
		</span>
	)
}
