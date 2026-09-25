import {
	isNumericGuessShape,
	type QuestionShape,
	STREAK_BONUS_SHARE,
	STREAK_BONUS_STEP,
	STREAK_MILESTONE_STEP,
	STREAK_NOTIFY_MIN,
	SWEEP_BONUS_SHARE,
	SWEEP_MIN_GAMES,
	shareOfPoints,
} from "@called-my-shot/scoring"
import type { CallUnscoredReason, Question } from "../../db/schema"
import { generationKey } from "../game-questions/generation-key"

// The pure half of streaks and sweeps - no database, so every rule here is
// testable without one. lib/streaks/recompute.ts loads the rows and writes
// what these return.

export type Outcome = "win" | "loss" | "skip"

// What one call does to its streak. It only counts once its question has a
// standing result - resolved, or disputed and still carrying the result under
// dispute, so filing a dispute can't freeze someone else's run - and only if
// the call itself was scored. A skip neither extends a run nor ends it.
export function callOutcome(call: {
	shape: QuestionShape
	status: Question["status"]
	unscoredReason: CallUnscoredReason | null
	hitTolerance: boolean | null
	selectionsCorrect: (boolean | null)[]
}): Outcome {
	if (call.status !== "resolved" && call.status !== "disputed") return "skip"
	if (call.unscoredReason !== null) return "skip"
	if (isNumericGuessShape(call.shape)) {
		if (call.hitTolerance === null) return "skip"
		return call.hitTolerance ? "win" : "loss"
	}
	const picks = call.selectionsCorrect
	if (picks.length === 0 || picks.some((correct) => correct === null)) {
		return "skip"
	}
	return picks.every((correct) => correct === true) ? "win" : "loss"
}

export type TrackRow = {
	callId: string
	questionId: string
	outcome: Outcome
	// When the result became real: the game going final, or its kickoff for a
	// game that went final before finalizedAt was recorded. Never
	// questions.resolvedAt, which a recheck, an overturn or a void stamps
	// again long after the game.
	realizedAt: Date
	startsAt: Date
}

export type Run = {
	length: number
	startCallId: string
	endCallId: string
	endedAt: Date
}

export type TrackResult = {
	// Run length as of each counted win. Misses have no position - the only
	// thing reading these is the call card's streak tag, which marks wins.
	positions: Map<string, number>
	// Every run of one or more wins, oldest first.
	runs: Run[]
	// The run still going after the newest counted call, or null if that call
	// was a miss.
	current: Run | null
	// The longest run. A later run has to be strictly longer to take it.
	best: Run | null
	// The same three, for runs of misses. A cold streak is the same
	// measurement with the outcome inverted, so a skip breaks neither and the
	// newest counted call leaves exactly one of current/currentCold set.
	coldRuns: Run[]
	currentCold: Run | null
	worstCold: Run | null
	lastSettledAt: Date | null
}

export function compareTrackRows(
	a: Pick<TrackRow, "callId" | "questionId" | "realizedAt" | "startsAt">,
	b: Pick<TrackRow, "callId" | "questionId" | "realizedAt" | "startsAt">,
): number {
	return (
		a.realizedAt.getTime() - b.realizedAt.getTime() ||
		a.startsAt.getTime() - b.startsAt.getTime() ||
		a.questionId.localeCompare(b.questionId) ||
		a.callId.localeCompare(b.callId)
	)
}

// Adds a counted call to the run it continues, or starts one when the last
// counted call went the other way. `current` is always the newest entry of
// `runs`, which is the one this grows in place.
function extendRun(runs: Run[], current: Run | null, row: TrackRow): Run {
	if (current) {
		const grown = {
			length: current.length + 1,
			startCallId: current.startCallId,
			endCallId: row.callId,
			endedAt: row.realizedAt,
		}
		runs[runs.length - 1] = grown
		return grown
	}
	const started = {
		length: 1,
		startCallId: row.callId,
		endCallId: row.callId,
		endedAt: row.realizedAt,
	}
	runs.push(started)
	return started
}

// A later run has to be strictly longer to take it, so a tie stays with the
// run that got there first.
function longestRun(runs: Run[]): Run | null {
	return runs.reduce<Run | null>(
		(best, run) => (!best || run.length > best.length ? run : best),
		null,
	)
}

export function computeTrack(rows: TrackRow[]): TrackResult {
	const positions = new Map<string, number>()
	const runs: Run[] = []
	const coldRuns: Run[] = []
	let current: Run | null = null
	let currentCold: Run | null = null
	let lastSettledAt: Date | null = null

	for (const row of [...rows].sort(compareTrackRows)) {
		if (row.outcome === "skip") continue
		lastSettledAt = row.realizedAt
		if (row.outcome === "loss") {
			currentCold = extendRun(coldRuns, currentCold, row)
			current = null
			continue
		}
		current = extendRun(runs, current, row)
		currentCold = null
		positions.set(row.callId, current.length)
	}

	return {
		positions,
		runs,
		current,
		best: longestRun(runs),
		coldRuns,
		currentCold,
		worstCold: longestRun(coldRuns),
		lastSettledAt,
	}
}

export type ScoredTrackRow = TrackRow & {
	// What the call scored. Only read on a win.
	points: number
	seasonId: string
}

export type StreakAward = {
	// The run's first call and the milestone, which together name one award
	// for as long as the run stands as it is.
	sourceKey: string
	// The season of the call that reached the milestone.
	seasonId: string
	points: number
}

// Every STREAK_BONUS_STEP-th win of every run pays STREAK_BONUS_SHARE of what
// the STREAK_BONUS_STEP wins ending there scored. Walks the same order and
// skip rules as computeTrack, so the awards always match the runs a track
// shows.
export function streakAwards(rows: ScoredTrackRow[]): StreakAward[] {
	const awards: StreakAward[] = []
	let run: ScoredTrackRow[] = []
	for (const row of [...rows].sort(compareTrackRows)) {
		if (row.outcome === "skip") continue
		if (row.outcome === "loss") {
			run = []
			continue
		}
		run.push(row)
		const first = run[0]
		if (!first || run.length % STREAK_BONUS_STEP !== 0) continue
		const scored = run
			.slice(-STREAK_BONUS_STEP)
			.reduce((sum, win) => sum + win.points, 0)
		awards.push({
			sourceKey: `${first.callId}:${run.length}`,
			seasonId: row.seasonId,
			points: shareOfPoints(scored, STREAK_BONUS_SHARE),
		})
	}
	return awards
}

// What a sweep pays: SWEEP_BONUS_SHARE of what its winner calls scored.
export function sweepAwardPoints(winnerCallPoints: number[]): number {
	return shareOfPoints(
		winnerCallPoints.reduce((sum, points) => sum + points, 0),
		SWEEP_BONUS_SHARE,
	)
}

// A change older than this is history being corrected, not news. Keeps a
// late ESPN correction or a reconcile pass from announcing a streak from last
// week as if it just happened.
export const ACHIEVEMENT_FRESH_MS = 48 * 60 * 60 * 1000

export function isFresh(settledAt: Date | null, now: Date): boolean {
	return (
		settledAt !== null &&
		now.getTime() - settledAt.getTime() <= ACHIEVEMENT_FRESH_MS
	)
}

// What user_streaks held for the track before this rebuild.
export type PreviousStreak = {
	currentLength: number
	currentStartCallId: string | null
	bestLength: number
	bestStartCallId: string | null
}

export type StreakEvent =
	| {
			kind: "streak_milestone"
			length: number
			milestone: number
			runStartCallId: string
	  }
	| {
			kind: "streak_personal_best"
			length: number
			previousBest: number
			runStartCallId: string
	  }
	| { kind: "streak_snapped"; length: number; runStartCallId: string }

// The announcements a rebuild turns up, by comparing the track before and
// after. Detection only - the same event is found again on every later
// rebuild, and it's lib/streaks/notices.ts that makes each one go out once.
export function streakEvents(
	prev: PreviousStreak | null,
	next: TrackResult,
	now: Date,
): StreakEvent[] {
	// A track rebuilt for the first time has no before to compare with, so
	// every run in it would read as new.
	if (!prev || !isFresh(next.lastSettledAt, now)) return []

	const events: StreakEvent[] = []
	const { current } = next

	if (current) {
		const before =
			prev.currentStartCallId === current.startCallId ? prev.currentLength : 0
		// Passing a best held by a different run. Once this run is the best,
		// every later rebuild sees it as its own best and this stays false.
		const beatOtherBest =
			next.best?.startCallId === current.startCallId &&
			prev.bestStartCallId !== current.startCallId &&
			prev.bestLength >= STREAK_NOTIFY_MIN &&
			current.length > prev.bestLength
		const milestone =
			Math.floor(current.length / STREAK_MILESTONE_STEP) * STREAK_MILESTONE_STEP

		if (beatOtherBest) {
			events.push({
				kind: "streak_personal_best",
				length: current.length,
				previousBest: prev.bestLength,
				runStartCallId: current.startCallId,
			})
		} else if (milestone >= STREAK_MILESTONE_STEP && milestone > before) {
			events.push({
				kind: "streak_milestone",
				length: current.length,
				milestone,
				runStartCallId: current.startCallId,
			})
		}
	}

	// The run that was going is over. It has to still exist from the same
	// first call and be at least as long as it was: an overturn in its middle
	// splits or shortens it, and that's a correction, not a snap.
	const prevStart = prev.currentStartCallId
	if (
		prevStart &&
		prev.currentLength >= STREAK_NOTIFY_MIN &&
		current?.startCallId !== prevStart
	) {
		const ended = next.runs.find((run) => run.startCallId === prevStart)
		if (ended && ended.length >= prev.currentLength) {
			events.push({
				kind: "streak_snapped",
				length: ended.length,
				runStartCallId: prevStart,
			})
		}
	}

	return events
}

export type SlateQuestion = {
	questionId: string
	status: Question["status"]
	startsAt: Date
	realizedAt: Date
}

export type SlateResult = {
	// No winner question in the slate is still waiting on its game.
	final: boolean
	// Winner questions with a standing result. A voided one - a tie - drops
	// its game out rather than costing anyone the sweep.
	gameCount: number
	sweptUserIds: string[]
	firstStartsAt: Date | null
	settledAt: Date | null
}

export function computeSlateSweeps(
	slateQuestions: SlateQuestion[],
	outcomesByUser: ReadonlyMap<string, ReadonlyMap<string, Outcome>>,
): SlateResult {
	const final = slateQuestions.every(
		(q) => q.status !== "open" && q.status !== "locked",
	)
	const counted = slateQuestions.filter(
		(q) => q.status === "resolved" || q.status === "disputed",
	)
	const firstStartsAt = counted.reduce<Date | null>(
		(first, q) => (!first || q.startsAt < first ? q.startsAt : first),
		null,
	)
	const settledAt = counted.reduce<Date | null>(
		(last, q) => (!last || q.realizedAt > last ? q.realizedAt : last),
		null,
	)
	const result = {
		final,
		gameCount: counted.length,
		firstStartsAt,
		settledAt,
	}
	if (!final || counted.length < SWEEP_MIN_GAMES) {
		return { ...result, sweptUserIds: [] }
	}

	const sweptUserIds = [...outcomesByUser]
		.filter(([, outcomes]) =>
			counted.every((q) => outcomes.get(q.questionId) === "win"),
		)
		.map(([userId]) => userId)
	return { ...result, sweptUserIds }
}

export type WinnerCandidate = {
	id: string
	generationKey: string | null
	isOfficial: boolean
	resolutionMode: Question["resolutionMode"]
	createdAt: Date
}

// The one who-wins question a game contributes to its slate. The sync posts
// exactly one per game (db/sync/sync-game-questions.ts), but an admin can
// still create another by hand, and a slate counting both would ask for the
// same game twice.
export function canonicalWinnerQuestion<T extends WinnerCandidate>(
	leagueSlug: string,
	gameId: string,
	candidates: T[],
): T | null {
	const key = generationKey([leagueSlug, gameId, "team_vs_team"])
	const generated = candidates.find((c) => c.generationKey === key)
	if (generated) return generated
	return (
		candidates
			.filter((c) => c.isOfficial && c.resolutionMode === "system")
			.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0] ?? null
	)
}
