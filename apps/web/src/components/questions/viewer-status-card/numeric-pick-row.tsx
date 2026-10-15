import {
	TIER_MAX_MULT,
	TIER_MIN_MULT,
	type ToleranceSpec,
	toleranceBand,
} from "@called-my-shot/scoring"
import { match, P } from "ts-pattern"
import { formatGuess } from "#/lib/field-signal"
import { formatMult, previewNumericPoints } from "#/lib/scoring"
import {
	type NumericRowResult,
	type SeasonPlayTerm,
	seasonPlayLine,
} from "#/lib/viewer-status"
import { HeroFinal } from "./hero-final"
import { HeroPayout } from "./hero-payout"
import { PickRowShell } from "./pick-row-shell"
import { committedRows, missedRow, wrongRows } from "./points-ledger"
import { RangePayout } from "./range-payout"
import { mathDefault, mathDownside, mathUpside } from "./styles"
import type { ResultLedger } from "./types"

export function NumericPickRow({
	guessValue,
	conviction,
	tolerance,
	rank,
	totalCalls,
	basePoints,
	play,
	lossRate,
	result,
	hero = false,
}: {
	guessValue: number
	conviction: number
	tolerance: ToleranceSpec | null
	rank: number
	totalCalls: number
	basePoints: number
	play: SeasonPlayTerm
	lossRate: number
	result: NumericRowResult
	hero?: boolean
}) {
	const playWeight = play?.weight ?? 1
	const band = tolerance !== null ? toleranceBand(guessValue, tolerance) : null
	// Absolute mode alone doesn't mean rate stat (a win-total's band is
	// absolute too, e.g. 5) - see isRateStat's own comment in
	// #/lib/field-signal for the full reasoning. tolerance.amount is the real
	// snapshotted value here, not a stand-in, so this checks it directly
	// rather than going through that shared helper (which takes a GraphQL
	// question shape this component doesn't have).
	const isRateStat =
		tolerance?.mode === "absolute" && !Number.isInteger(tolerance.amount)
	const bandNote =
		band !== null
			? `within ±${formatGuess(band, isRateStat)} counts as a hit`
			: null

	if (result.kind === "resolved") {
		const win = result.totalPoints >= 0
		const committed = Math.round(basePoints * playWeight * (conviction / 100))
		// closenessMult is the real, persisted value (calls.closeness_mult) -
		// not reconstructed. The early multiplier isn't stored separately, but
		// unlike the closeness rank (which needs every other hit on the
		// question to even define), it's exact arithmetic once closenessMult
		// and totalPoints are both known: earlyMult = totalPoints / (committed
		// × closenessMult).
		const multipliers =
			win && committed !== 0 && result.closenessMult
				? {
						closeness: result.closenessMult,
						early: result.totalPoints / (committed * result.closenessMult),
					}
				: null
		// The raw share the multiplier came from, same reasoning as
		// SelectionPickRow's note - a real number ("62% of the field
		// guessed at least this close") stays legible regardless of field
		// size, where a qualitative label wouldn't.
		const closenessNote =
			result.closenessFieldPct !== null
				? `${Math.round(result.closenessFieldPct)}% of the field's points guessed at least this close`
				: undefined
		const outcome = match({ win, multipliers })
			.returnType<ResultLedger>()
			.with({ win: true, multipliers: P.nonNullable }, ({ multipliers }) => ({
				label: "IF RIGHT",
				math: (
					<>
						<span className={mathDownside}>{committed}</span>
						<span className={mathDefault}>
							{" "}
							× {formatMult(multipliers.closeness)} closeness ×{" "}
							{formatMult(multipliers.early)} early ={" "}
						</span>
						<span className={mathUpside}>+{result.totalPoints}</span>
					</>
				),
				note: closenessNote,
			}))
			.with({ win: true }, () => ({
				label: "IF RIGHT",
				math: <span className={mathUpside}>+{result.totalPoints}</span>,
				note: closenessNote,
			}))
			.with({ win: false }, () =>
				missedRow(result.totalPoints, committed, lossRate),
			)
			.exhaustive()
		return (
			<PickRowShell
				// The guess is the headline in hero mode; a compact row has
				// nothing else to name, as a numeric guess is always one pick.
				name={hero ? formatGuess(guessValue, isRateStat) : null}
				note={bandNote}
				playNote={seasonPlayLine(play)}
				breakdown={{
					ledger: [
						...committedRows(basePoints, conviction, committed, play),
						outcome,
					],
					note: outcome.note,
				}}
				payout={hero ? <HeroFinal points={result.totalPoints} /> : null}
				hero={hero}
			/>
		)
	}

	const preview = previewNumericPoints(
		basePoints * playWeight,
		lossRate,
		conviction,
		rank,
		totalCalls,
	)
	const committed = Math.round(basePoints * playWeight * (conviction / 100))
	return (
		<PickRowShell
			name={formatGuess(guessValue, isRateStat)}
			note={bandNote}
			playNote={seasonPlayLine(play)}
			breakdown={{
				ledger: [
					...committedRows(basePoints, conviction, committed, play),
					{
						label: "IF RIGHT",
						math: (
							<>
								<span className={mathDownside}>{committed}</span>
								<span className={mathDefault}>
									{" "}
									× {TIER_MIN_MULT}–{TIER_MAX_MULT} closeness ×{" "}
									{formatMult(preview.earlyTier.mult)} early ={" "}
								</span>
								<span className={mathUpside}>
									+{preview.winLow}–{preview.winHigh}
								</span>
							</>
						),
					},
					...wrongRows(committed, lossRate, preview.lose),
				],
			}}
			payout={
				hero ? (
					<HeroPayout
						win={`+${preview.winLow}–${preview.winHigh}`}
						lose={`−${preview.lose}`}
					/>
				) : (
					<RangePayout
						winLow={preview.winLow}
						winHigh={preview.winHigh}
						lose={preview.lose}
					/>
				)
			}
			hero={hero}
		/>
	)
}
