import { pluralize } from "#/lib/pluralize"
import { formatMult } from "#/lib/scoring"
import type { SeasonPlayTerm, SeriesStageTerm } from "#/lib/viewer-status"
import { mathDefault, mathDownside, mathLose } from "./styles"
import type { LedgerRow, ResultLedger } from "./types"

const missNote = "boldness and early bonuses only pay out on a hit"

// A season-long call's committed points carry its season-play weight (see
// seasonPlayWeight), and a series call's its series stage (see
// seriesStageWeight), so every row built off committed carries it too, and
// what's behind it gets a row of its own. A series call made before Game 1
// counts in full and gets neither.
export function committedRows(
	basePoints: number,
	conviction: number,
	committed: number,
	play: SeasonPlayTerm,
	stage: SeriesStageTerm = null,
): LedgerRow[] {
	const playText = play ? ` × ${formatMult(play.weight)} season play` : ""
	const scaledStage = stage && stage.gamesPlayed > 0 ? stage : null
	const stageText = scaledStage
		? ` × ${formatMult(scaledStage.weight)} series stage`
		: ""
	return [
		{
			label: "COMMITTED",
			math: (
				<>
					<span className={mathDefault}>
						{basePoints} × {conviction}% conviction{playText}
						{stageText} ={" "}
					</span>
					<span className={mathDownside}>{committed}</span>
				</>
			),
		},
		...(play ? [seasonPlayRow(play)] : []),
		...(scaledStage ? [seriesStageRow(scaledStage)] : []),
	]
}

function seriesStageRow(stage: NonNullable<SeriesStageTerm>): LedgerRow {
	const { gamesPlayed, bestOf } = stage
	return {
		label: "SERIES STAGE",
		math: (
			<span className={mathDefault}>
				called before Game {gamesPlayed + 1} of {bestOf} = ×
				{formatMult(stage.weight)}
			</span>
		),
	}
}

function seasonPlayRow(play: NonNullable<SeasonPlayTerm>): LedgerRow {
	const { weeksPlayed, weeksCounted, league } = play
	const weeks =
		weeksCounted === 0
			? `no ${league} weeks yet`
			: `${weeksPlayed} of ${weeksCounted} ${league} ${pluralize(weeksCounted, "week")} ${play.settled ? "played" : "so far"}`
	return {
		label: "SEASON PLAY",
		math: (
			<span className={mathDefault}>
				{weeks} = ×{formatMult(play.weight)}
			</span>
		),
	}
}

// The stored points are authoritative: a call scored at a full loss reads as
// one even on a question whose loss rate isn't 1.
export function missedRow(
	points: number,
	committed: number,
	lossRate: number,
): ResultLedger {
	const partial = lossRate !== 1 && Math.abs(points) !== committed
	return {
		label: "RESULT",
		math: (
			<>
				{partial ? (
					<>
						<span className={mathDefault}>missed: </span>
						<span className={mathDownside}>{committed}</span>
						<span className={mathDefault}> × {lossRate} loss rate = </span>
					</>
				) : (
					<span className={mathDefault}>
						missed: you lose what you committed ={" "}
					</span>
				)}
				<span className={mathLose}>−{Math.abs(points)}</span>
			</>
		),
		note: missNote,
	}
}

export function wrongRows(
	committed: number,
	lossRate: number,
	lose: number,
): LedgerRow[] {
	if (lossRate === 1) return []
	return [
		{
			label: "IF WRONG",
			math: (
				<>
					<span className={mathDownside}>{committed}</span>
					<span className={mathDefault}> × {lossRate} loss rate = </span>
					<span className={mathLose}>−{lose}</span>
				</>
			),
		},
	]
}
