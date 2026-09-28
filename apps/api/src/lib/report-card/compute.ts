import {
	BASE_POINTS_BY_SHAPE,
	callReturnVariance,
	effectiveLossRate,
	type Grade,
	gradeForReturn,
	pointsAtStake,
	pointsCommitted,
	type QuestionShape,
	REPORT_CARD_MIN_SETTLED,
	returnOnCommitted,
	returnStandardError,
	SHAPE_FAMILIES,
	SHAPE_FAMILY_LABEL,
	SHAPE_LABEL,
	type ShapeFamily,
	shapeFamilyFor,
} from "@called-my-shot/scoring"
import type { CallUnscoredReason, Question } from "../../db/schema"
import { callOutcome } from "../streaks/compute"

// The pure half of the report card - no database, so every exclusion rule
// here is testable without one. ./load.ts reads the rows and hands them over.
// Same split as lib/streaks/compute.ts vs lib/streaks/recompute.ts.
//
// Labels come from @called-my-shot/scoring rather than being written here or
// left to the client. The share card settles it: satori renders that PNG
// server-side, so the API has to name a family itself, and a second hand-kept
// copy of those strings is the exact problem the comment on SHAPE_LABEL in
// lib/share-cards/call-summary.ts already describes.

export type ReportCardCall = {
	callId: string
	// Null for a question spanning no single game (a season stat, a
	// postseason series). Such a call counts toward every total but can't
	// belong to a best or worst game.
	gameId: string | null
	shape: QuestionShape
	status: Question["status"]
	unscoredReason: CallUnscoredReason | null
	hitTolerance: boolean | null
	// Frozen on the question at creation, not read from LOSS_RATE_BY_SHAPE -
	// a question tuned per league and stat carries its own rate.
	lossRate: number
	// What the call actually scored. NOT calls.resultPoints on its own: that
	// column is null for every option shape, which scores through
	// call_selections instead (see the comment on `calls` in
	// db/schema/calls.ts). Reading the call column alone silently drops most
	// settled calls. ./load.ts resolves the two into this one number.
	netPoints: number | null
	// One entry per selection for an option shape, one for a numeric guess.
	// Kept per-selection rather than pre-summed so committed and stake round
	// exactly the way selectionPoints does, selection by selection.
	convictions: number[]
	selectionsCorrect: (boolean | null)[]
	// Each selection's own side rate where a priced line set one, in the same
	// order as convictions. Null, or missing for a numeric guess, falls back
	// to lossRate.
	selectionLossRates: (number | null)[]
	createdAt: Date
}

export type ReportCardStats = {
	settledCount: number
	wins: number
	losses: number
	pendingCount: number
	netPoints: number
	committedPoints: number
	// What the still-pending calls in this window stand to lose. Reported
	// beside the return, never inside it - see statsFrom below.
	pendingStake: number
	returnPct: number | null
}

// Rows carry their label, not just their enum. The share card is the reason:
// satori renders that PNG server-side with no client anywhere, so the API has
// to be able to write "Over/Under" itself. Sending it over GraphQL too means
// the two surfaces can't word a row differently, and it matches what the API
// already does for GameWindow.label and a sweep's slateLabel.
export type ReportCardFamilyRow = ReportCardStats & {
	family: ShapeFamily
	label: string
}
export type ReportCardShapeRow = ReportCardStats & {
	shape: QuestionShape
	family: ShapeFamily
	label: string
}

export type ReportCard = ReportCardStats & {
	grade: Grade | null
	isFinal: boolean
	byFamily: ReportCardFamilyRow[]
	byShape: ReportCardShapeRow[]
	// Ids, not rows - keeping this module free of the database is the point.
	biggestHitCallId: string | null
	biggestMissCallId: string | null
	bestGame: ReportCardGame | null
	worstGame: ReportCardGame | null
}

// One game's settled calls in the window, netted together.
export type ReportCardGame = {
	gameId: string
	netPoints: number
	wins: number
	losses: number
}

// Below this many games with a settled call, a best or worst game would just
// restate the card's own totals.
export const REPORT_CARD_MIN_GAMES = 2

type Bucket = {
	settledCount: number
	wins: number
	losses: number
	pendingCount: number
	netPoints: number
	committedPoints: number
	// Sum of callReturnVariance over settled selections, for the grade.
	varianceSum: number
	pendingStake: number
}

const emptyBucket = (): Bucket => ({
	settledCount: 0,
	wins: 0,
	losses: 0,
	pendingCount: 0,
	netPoints: 0,
	committedPoints: 0,
	varianceSum: 0,
	pendingStake: 0,
})

// Three ways, not two. callOutcome collapses "still open" and "voided or
// unscored" into the same "skip", and those have to be held apart here: an
// open call is pending and will count later, a voided one never counts at
// all. callOutcome isn't widened to say so because streaks depend on its
// three-value contract.
type Classification =
	| { kind: "excluded" }
	| { kind: "pending" }
	| { kind: "settled"; won: boolean }

export function classifyCall(call: ReportCardCall): Classification {
	if (call.status === "voided" || call.unscoredReason !== null) {
		return { kind: "excluded" }
	}
	const outcome = callOutcome({
		shape: call.shape,
		status: call.status,
		unscoredReason: call.unscoredReason,
		hitTolerance: call.hitTolerance,
		selectionsCorrect: call.selectionsCorrect,
	})
	if (outcome === "skip") return { kind: "pending" }
	return { kind: "settled", won: outcome === "win" }
}

function accumulate(
	bucket: Bucket,
	call: ReportCardCall,
	classification: Classification,
): void {
	const basePoints = BASE_POINTS_BY_SHAPE[call.shape]
	if (classification.kind === "excluded") return

	if (classification.kind === "pending") {
		bucket.pendingCount += 1
		for (const [index, conviction] of call.convictions.entries()) {
			bucket.pendingStake += pointsAtStake(
				basePoints,
				effectiveLossRate(call.lossRate, call.selectionLossRates[index]),
				conviction,
			)
		}
		return
	}

	bucket.settledCount += 1
	if (classification.won) bucket.wins += 1
	else bucket.losses += 1
	bucket.netPoints += call.netPoints ?? 0
	for (const [index, conviction] of call.convictions.entries()) {
		const committed = pointsCommitted(basePoints, conviction)
		bucket.committedPoints += committed
		bucket.varianceSum += callReturnVariance(
			committed,
			effectiveLossRate(call.lossRate, call.selectionLossRates[index]),
		)
	}
}

const statsFrom = ({ varianceSum, ...bucket }: Bucket): ReportCardStats => ({
	...bucket,
	// Settled commitment only. Folding pending calls into the denominator
	// would drag the number toward zero all afternoon and then snap when the
	// last game settled, so the headline stays a true statement about results
	// that already exist and the pending count carries the caveat.
	returnPct: returnOnCommitted(bucket.netPoints, bucket.committedPoints),
})

const netOf = (call: ReportCardCall): number => call.netPoints ?? 0

// A window holding two equally good calls has to pick the same one on every
// read, or the card flickers between them on reload. Oldest first, then by
// id, same reasoning as compareTrackRows in lib/streaks/compute.ts.
function breaksTie(candidate: ReportCardCall, held: ReportCardCall): boolean {
	const byTime = candidate.createdAt.getTime() - held.createdAt.getTime()
	if (byTime !== 0) return byTime < 0
	return candidate.callId.localeCompare(held.callId) < 0
}

function upsert<K>(map: Map<K, Bucket>, key: K): Bucket {
	const existing = map.get(key)
	if (existing) return existing
	const fresh = emptyBucket()
	map.set(key, fresh)
	return fresh
}

export function buildReportCard(calls: ReportCardCall[]): ReportCard {
	const totals = emptyBucket()
	const families = new Map<ShapeFamily, Bucket>()
	const shapes = new Map<QuestionShape, Bucket>()

	const games = new Map<string, ReportCardGame>()

	let biggestHit: ReportCardCall | null = null
	let biggestMiss: ReportCardCall | null = null

	for (const call of calls) {
		const classification = classifyCall(call)
		if (classification.kind === "excluded") continue

		const family = shapeFamilyFor(call.shape)
		accumulate(totals, call, classification)
		accumulate(upsert(families, family), call, classification)
		accumulate(upsert(shapes, call.shape), call, classification)

		if (classification.kind !== "settled") continue
		if (call.gameId !== null) {
			const game = games.get(call.gameId) ?? {
				gameId: call.gameId,
				netPoints: 0,
				wins: 0,
				losses: 0,
			}
			game.netPoints += netOf(call)
			if (classification.won) game.wins += 1
			else game.losses += 1
			games.set(call.gameId, game)
		}
		// Keyed on the outcome rather than the sign of the points. The two
		// agree today - a win always pays positive and a miss always costs -
		// but outcome can't be confused by a rounding edge landing a call at
		// exactly zero, and it can never pick up an unscored call.
		if (classification.won) {
			const isBigger =
				!biggestHit ||
				netOf(call) > netOf(biggestHit) ||
				(netOf(call) === netOf(biggestHit) && breaksTie(call, biggestHit))
			if (isBigger) biggestHit = call
		} else {
			// The worst miss is the most negative, so this comparison runs the
			// other way round.
			const isWorse =
				!biggestMiss ||
				netOf(call) < netOf(biggestMiss) ||
				(netOf(call) === netOf(biggestMiss) && breaksTie(call, biggestMiss))
			if (isWorse) biggestMiss = call
		}
	}

	const { bestGame, worstGame } = pickGames([...games.values()])
	const stats = statsFrom(totals)
	return {
		...stats,
		// Withheld, not faked, below the sample floor: one settled stat-leader
		// call that hit is a +400% A+. The record and the points are real at
		// any count and still render.
		grade:
			stats.settledCount >= REPORT_CARD_MIN_SETTLED
				? gradeForReturn(
						stats.returnPct,
						returnStandardError(totals.committedPoints, totals.varianceSum),
					)
				: null,
		isFinal: totals.pendingCount === 0 && totals.settledCount > 0,
		// Emitted in SHAPE_FAMILIES order rather than by volume, so the card
		// doesn't reshuffle its rows as a slate settles.
		byFamily: SHAPE_FAMILIES.flatMap((family) => {
			const bucket = families.get(family)
			return bucket
				? [
						{
							...statsFrom(bucket),
							family,
							label: SHAPE_FAMILY_LABEL[family],
						},
					]
				: []
		}),
		byShape: SHAPE_FAMILIES.flatMap((family) =>
			[...shapes.entries()]
				.filter(([shape]) => shapeFamilyFor(shape) === family)
				.sort(([a], [b]) => SHAPE_LABEL[a].localeCompare(SHAPE_LABEL[b]))
				.map(([shape, bucket]) => ({
					...statsFrom(bucket),
					shape,
					family,
					label: SHAPE_LABEL[shape],
				})),
		),
		biggestHitCallId: biggestHit?.callId ?? null,
		biggestMissCallId: biggestMiss?.callId ?? null,
		bestGame,
		worstGame,
	}
}

// Keyed on the sign of the game's net, the way a call's highlight is keyed on
// its outcome: a best game has to have come out ahead and a worst game behind,
// so a window where every game lost shows a worst game and no best. A game
// that netted exactly zero is neither. Ties break on id so the pick is the
// same on every read.
function pickGames(games: ReportCardGame[]): {
	bestGame: ReportCardGame | null
	worstGame: ReportCardGame | null
} {
	if (games.length < REPORT_CARD_MIN_GAMES) {
		return { bestGame: null, worstGame: null }
	}
	const ordered = [...games].sort(
		(a, b) => b.netPoints - a.netPoints || a.gameId.localeCompare(b.gameId),
	)
	const top = ordered[0]
	const bottom = ordered[ordered.length - 1]
	return {
		bestGame: top && top.netPoints > 0 ? top : null,
		worstGame: bottom && bottom.netPoints < 0 ? bottom : null,
	}
}
