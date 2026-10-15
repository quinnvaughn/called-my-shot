import { crowdTierFor, type OptionPricing } from "@called-my-shot/scoring"
import { match, P } from "ts-pattern"
import type { QuestionShape } from "#/graphql/generated/graphql"
import {
	formatMult,
	previewSelectionPoints,
	selectionEarlyTier,
} from "#/lib/scoring"
import {
	type SeasonPlayTerm,
	type SelectionRowResult,
	type SeriesStageTerm,
	seasonPlayLine,
	seriesStageLine,
	underdogMath,
} from "#/lib/viewer-status"
import { HeroFinal } from "./hero-final"
import { HeroPayout } from "./hero-payout"
import { Payout } from "./payout"
import { PickRowShell } from "./pick-row-shell"
import { committedRows, missedRow, wrongRows } from "./points-ledger"
import { mathDefault, mathDownside, mathUpside } from "./styles"
import type { PickSubject, ResultLedger } from "./types"

export function SelectionPickRow({
	label,
	subject,
	crowdPct,
	totalOptions,
	conviction,
	rank,
	totalCalls,
	shape,
	seasonGamesPlayed,
	seasonTotalGames,
	basePoints,
	play,
	stage = null,
	lossRate,
	pricing,
	result,
	// Only matters once resolved - the pending preview has nothing else
	// naming the pick, so it always shows the name regardless of this flag.
	showName = true,
	hero = false,
}: {
	label: string
	subject: PickSubject
	// The pick's share of the field's conviction - see crowdTotals.
	crowdPct: number | null
	totalOptions: number
	conviction: number
	rank: number
	totalCalls: number
	shape: QuestionShape
	seasonGamesPlayed: number | null
	seasonTotalGames: number | null
	basePoints: number
	play: SeasonPlayTerm
	stage?: SeriesStageTerm
	lossRate: number
	pricing: OptionPricing
	result: SelectionRowResult
	showName?: boolean
	hero?: boolean
}) {
	const playWeight = (play?.weight ?? 1) * (stage?.weight ?? 1)
	const playNote = seasonPlayLine(play) ?? seriesStageLine(stage)
	if (crowdPct === null) {
		return (
			<PickRowShell
				name={label}
				subject={subject}
				note={null}
				breakdown={null}
				payout="-"
			/>
		)
	}

	if (result.kind === "resolved") {
		// tier comes from live crowdPct, which is safe to reuse post-resolution
		// (same formula, and no new calls can land on a locked question, so it
		// can't drift). The early-caller bonus is not safe to re-derive the
		// same way - it's frozen off rank/totalCalls at the moment resolution
		// actually ran, which isn't guaranteed to equal a live read of those
		// same fields later. Rather than recompute a multiplier that can
		// silently disagree with the real result.points, the combined
		// multiplier is backed out from the authoritative number instead -
		// committed and points are both trustworthy, so committed × mult =
		// points always balances by construction.
		// Null on a priced side, which has no boldness - see crowdTierFor.
		const tier = crowdTierFor(crowdPct, totalOptions, pricing)
		const winMult = pricing.winMult ?? 1
		const committed = Math.round(basePoints * playWeight * (conviction / 100))
		// The combined multiplier backed out of the authoritative points value
		// (see comment above), then divided back by the safe/live tier.mult to
		// isolate what the early-caller bonus alone must have been. Both steps
		// stay exact by construction - committed × tier.mult × earlyMult always
		// reproduces result.points, it's never left as an unstated "rest."
		const multipliers =
			result.isCorrect && committed !== 0
				? {
						underdog: winMult,
						boldness: tier?.mult ?? null,
						early: result.points / committed / winMult / (tier?.mult ?? 1),
					}
				: null
		// The raw number the multiplier came from, not a qualitative
		// label - "33% of the field also picked this" stays true and
		// legible no matter how small the field is, where a label like
		// "ahead of the curve" would read strangely for, say, 1st of 3.
		const fieldNote = `${Math.round(crowdPct)}% of the field's points were on this pick`
		// Matches the shipped mockup's own inconsistency on purpose: a hit
		// still gets labeled "IF RIGHT" (it's explaining the formula, not
		// narrating an event), a miss gets "RESULT" since there's no
		// multiplier story left to tell.
		const outcome = match({ isCorrect: result.isCorrect, multipliers })
			.returnType<ResultLedger>()
			.with(
				{ isCorrect: true, multipliers: P.nonNullable },
				({ multipliers }) => ({
					label: "IF RIGHT",
					math: (
						<>
							<span className={mathDownside}>{committed}</span>
							<span className={mathDefault}>
								{" "}
								{underdogMath(multipliers.underdog)}×{" "}
								{multipliers.boldness !== null &&
									`${formatMult(multipliers.boldness)} boldness × `}
								{formatMult(multipliers.early)} early ={" "}
							</span>
							<span className={mathUpside}>+{result.points}</span>
						</>
					),
					note: fieldNote,
				}),
			)
			// A zero stake leaves nothing to back the multipliers out of.
			.with({ isCorrect: true }, () => ({
				label: "IF RIGHT",
				math: <span className={mathUpside}>+{result.points}</span>,
				note: fieldNote,
			}))
			.with({ isCorrect: false }, () =>
				missedRow(result.points, committed, lossRate),
			)
			.exhaustive()
		return (
			<PickRowShell
				name={showName || hero ? label : null}
				subject={subject}
				note={null}
				playNote={playNote}
				breakdown={{
					ledger: [
						...committedRows(basePoints, conviction, committed, play, stage),
						outcome,
					],
					note: outcome.note,
				}}
				payout={hero ? <HeroFinal points={result.points} /> : null}
				hero={hero}
			/>
		)
	}

	const earlyTier = selectionEarlyTier(
		shape,
		rank,
		totalCalls,
		seasonGamesPlayed,
		seasonTotalGames,
	)
	const preview = previewSelectionPoints(
		basePoints * playWeight,
		lossRate,
		crowdPct,
		totalOptions,
		conviction,
		earlyTier,
		pricing,
	)
	const committed = Math.round(basePoints * playWeight * (conviction / 100))
	return (
		<PickRowShell
			name={label}
			subject={subject}
			note={null}
			playNote={playNote}
			breakdown={{
				ledger: [
					...committedRows(basePoints, conviction, committed, play, stage),
					{
						label: "IF RIGHT",
						math: (
							<>
								<span className={mathDownside}>{committed}</span>
								<span className={mathDefault}>
									{" "}
									{underdogMath(preview.winMult)}×{" "}
									{preview.tier &&
										`${formatMult(preview.tier.mult)} boldness × `}
									{formatMult(preview.earlyTier.mult)} early ={" "}
								</span>
								<span className={mathUpside}>+{preview.win}</span>
							</>
						),
					},
					...wrongRows(committed, lossRate, preview.lose),
				],
			}}
			payout={
				hero ? (
					<HeroPayout win={`+${preview.win}`} lose={`−${preview.lose}`} />
				) : (
					<Payout win={preview.win} lose={preview.lose} />
				)
			}
			hero={hero}
		/>
	)
}
