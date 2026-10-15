import { effectiveLossRate } from "@called-my-shot/scoring"
import { VStack } from "styled-system/jsx"
import {
	isNumericQuestionShape,
	isOverUnderQuestionShape,
	optionDisplayLabel,
} from "#/lib/question-labels"
import { basePointsForGql, toleranceSpecFrom } from "#/lib/scoring"
import {
	numericRowResult,
	type SeasonPlayTerm,
	selectionRowResult,
} from "#/lib/viewer-status"
import { NumericPickRow } from "./numeric-pick-row"
import { SelectionPickRow } from "./selection-pick-row"
import type { ViewerCall } from "./types"

// One row per pick: a single row for a numeric guess, one per selection
// otherwise. Before the question settles every row previews its payout; once
// settled, each row shows its real result as soon as that pick's points have
// been written.
export function PickRows({
	call,
	settled,
	hero = false,
	callCount,
	totalOptions,
	numericTolerancePct,
	numericToleranceAbsolute,
	isRateStat,
}: {
	call: ViewerCall
	settled: boolean
	// The pick as the card's headline, with its payout at the same scale,
	// instead of a compact row.
	hero?: boolean
	callCount: number
	totalOptions: number
	numericTolerancePct: number | null
	numericToleranceAbsolute: number | null
	isRateStat: boolean
}) {
	const { shape, isOfficial, isPriced, ouLine, lossRate, league } =
		call.question
	const basePoints = basePointsForGql(shape, isOfficial, isPriced)
	const play: SeasonPlayTerm = call.seasonPlay
		? { ...call.seasonPlay, league: league.abbreviation }
		: null

	if (isNumericQuestionShape(shape)) {
		const { guessValue, conviction } = call
		return (
			<VStack gap="1.5" alignItems="stretch">
				{guessValue !== null && conviction !== null && (
					<NumericPickRow
						guessValue={guessValue}
						conviction={conviction}
						tolerance={toleranceSpecFrom(
							numericTolerancePct,
							numericToleranceAbsolute,
						)}
						rank={call.currentRank}
						totalCalls={callCount}
						basePoints={basePoints}
						play={play}
						lossRate={lossRate}
						result={numericRowResult(call, settled)}
						hero={hero}
					/>
				)}
			</VStack>
		)
	}

	return (
		<VStack gap="1.5" alignItems="stretch">
			{call.selections.map((selection) => (
				<SelectionPickRow
					key={selection.option.label}
					subject={selection.option}
					label={optionDisplayLabel(
						selection.option.label,
						isOverUnderQuestionShape(shape),
						ouLine,
						isRateStat,
					)}
					crowdPct={selection.option.crowdPct}
					totalOptions={totalOptions}
					conviction={selection.conviction}
					rank={call.currentRank}
					totalCalls={callCount}
					shape={shape}
					seasonGamesPlayed={call.seasonGamesPlayed}
					seasonTotalGames={call.seasonTotalGames}
					basePoints={basePoints}
					play={play}
					lossRate={effectiveLossRate(lossRate, selection.option.lossRate)}
					pricing={selection.option}
					// Several picks (player_season_award/team_season_award) need
					// each row to say what it is; a single pick is named by the
					// hero instead.
					showName={call.selections.length > 1}
					result={selectionRowResult(selection, settled)}
					hero={hero}
				/>
			))}
		</VStack>
	)
}
