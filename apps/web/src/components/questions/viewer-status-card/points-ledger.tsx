import { pluralize } from "#/lib/pluralize"
import { formatMult } from "#/lib/scoring"
import type { SeasonPlayTerm } from "#/lib/viewer-status"
import { mathDefault, mathDownside, mathLose } from "./styles"
import type { LedgerRow, ResultLedger } from "./types"

const missNote = "boldness and early bonuses only pay out on a hit"

// A season-long call's committed points carry its season-play weight (see
// seasonPlayWeight), so every row built off committed carries it too, and
// the weeks behind it get a row of their own.
export function committedRows(
	basePoints: number,
	conviction: number,
	committed: number,
	play: SeasonPlayTerm,
): LedgerRow[] {
	const playText = play ? ` × ${formatMult(play.weight)} season play` : ""
	return [
		{
			label: "COMMITTED",
			math: (
				<>
					<span className={mathDefault}>
						{basePoints} × {conviction}% conviction{playText} ={" "}
					</span>
					<span className={mathDownside}>{committed}</span>
				</>
			),
		},
		...(play ? [seasonPlayRow(play)] : []),
	]
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
