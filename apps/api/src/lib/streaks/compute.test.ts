import {
	STREAK_BONUS_SHARE,
	STREAK_BONUS_STEP,
	SWEEP_BONUS_SHARE,
} from "@called-my-shot/scoring"
import { describe, expect, it } from "vitest"
import {
	ACHIEVEMENT_FRESH_MS,
	callOutcome,
	canonicalWinnerQuestion,
	computeSlateSweeps,
	computeTrack,
	type Outcome,
	type PreviousStreak,
	type ScoredTrackRow,
	type SlateQuestion,
	streakAwards,
	streakEvents,
	sweepAwardPoints,
	type TrackResult,
	type TrackRow,
} from "./compute"

const BASE = new Date("2026-09-13T17:00:00Z").getTime()
const at = (hours: number) => new Date(BASE + hours * 60 * 60 * 1000)

let seq = 0
function row(
	outcome: Outcome,
	hours: number,
	overrides: Partial<TrackRow> = {},
): TrackRow {
	seq++
	const id = String(seq).padStart(4, "0")
	return {
		callId: `call-${id}`,
		questionId: `question-${id}`,
		outcome,
		realizedAt: at(hours),
		startsAt: at(hours - 3),
		...overrides,
	}
}

// One row per outcome, an hour apart, in order.
const rowsFor = (outcomes: Outcome[]) =>
	outcomes.map((outcome, index) => row(outcome, index))

const snapshot = (track: TrackResult): PreviousStreak => ({
	currentLength: track.current?.length ?? 0,
	currentStartCallId: track.current?.startCallId ?? null,
	bestLength: track.best?.length ?? 0,
	bestStartCallId: track.best?.startCallId ?? null,
})

// Just after the newest row settled.
const nowAfter = (rows: TrackRow[]) =>
	new Date(Math.max(...rows.map((r) => r.realizedAt.getTime())) + 60_000)

const W: Outcome = "win"
const L: Outcome = "loss"
const S: Outcome = "skip"

describe("callOutcome", () => {
	const option = {
		shape: "team_vs_team" as const,
		status: "resolved" as const,
		unscoredReason: null,
		hitTolerance: null,
	}

	it("skips a call until its question has a standing result", () => {
		for (const status of ["open", "locked", "voided"] as const) {
			expect(
				callOutcome({ ...option, status, selectionsCorrect: [true] }),
			).toBe("skip")
		}
	})

	it("counts a disputed question at the result under dispute", () => {
		expect(
			callOutcome({ ...option, status: "disputed", selectionsCorrect: [true] }),
		).toBe("win")
	})

	it("skips an unscored call", () => {
		expect(
			callOutcome({
				...option,
				unscoredReason: "creator_sole_caller",
				selectionsCorrect: [true],
			}),
		).toBe("skip")
	})

	it("reads a numeric guess off hitTolerance", () => {
		const numeric = { ...option, shape: "team_stat_numeric_guess" as const }
		const outcome = (hitTolerance: boolean | null) =>
			callOutcome({ ...numeric, hitTolerance, selectionsCorrect: [] })
		expect(outcome(true)).toBe("win")
		expect(outcome(false)).toBe("loss")
		expect(outcome(null)).toBe("skip")
	})

	it("needs every selection correct for an option pick to win", () => {
		const outcome = (selectionsCorrect: (boolean | null)[]) =>
			callOutcome({ ...option, selectionsCorrect })
		expect(outcome([true])).toBe("win")
		expect(outcome([false])).toBe("loss")
		expect(outcome([true, false])).toBe("loss")
		expect(outcome([null])).toBe("skip")
		expect(outcome([])).toBe("skip")
	})
})

describe("computeTrack", () => {
	it("doesn't break a run on a skip", () => {
		const track = computeTrack(rowsFor([W, S, W]))
		expect(track.current?.length).toBe(2)
	})

	it("ends a run on a loss and records each win's position", () => {
		const rows = rowsFor([W, W, L, W])
		const track = computeTrack(rows)
		expect(track.current?.length).toBe(1)
		expect(track.best?.length).toBe(2)
		expect([...track.positions.values()]).toEqual([1, 2, 1])
		expect(track.positions.has(rows[2]?.callId ?? "")).toBe(false)
	})

	it("has no current run when the newest counted call missed", () => {
		const track = computeTrack(rowsFor([W, L, S]))
		expect(track.current).toBeNull()
		expect(track.best?.length).toBe(1)
	})

	it("keeps the earlier run as best on a tie", () => {
		const rows = rowsFor([W, W, L, W, W])
		const track = computeTrack(rows)
		expect(track.best?.startCallId).toBe(rows[0]?.callId)
	})

	it("orders by when results landed, not the order rows arrive in", () => {
		const loss = row(L, 1)
		const win = row(W, 2)
		const track = computeTrack([win, loss])
		expect(track.current?.length).toBe(1)
		expect(track.current?.startCallId).toBe(win.callId)
	})

	it("breaks a tie in result time on kickoff", () => {
		const late = row(W, 5, { startsAt: at(2) })
		const early = row(L, 5, { startsAt: at(1) })
		const track = computeTrack([late, early])
		expect(track.current?.startCallId).toBe(late.callId)
	})

	it("takes the newest counted result as lastSettledAt", () => {
		const rows = rowsFor([W, L, S])
		expect(computeTrack(rows).lastSettledAt).toEqual(rows[1]?.realizedAt)
		expect(computeTrack([]).lastSettledAt).toBeNull()
	})

	it("counts a cold streak the newest counted call is still in", () => {
		const track = computeTrack(rowsFor([W, L, L, L]))
		expect(track.currentCold?.length).toBe(3)
		expect(track.worstCold?.length).toBe(3)
	})

	it("doesn't break a cold streak on a skip", () => {
		const track = computeTrack(rowsFor([L, S, L]))
		expect(track.currentCold?.length).toBe(2)
	})

	it("ends a cold streak on a win and keeps it as the worst", () => {
		const track = computeTrack(rowsFor([L, L, L, W, L]))
		expect(track.currentCold?.length).toBe(1)
		expect(track.worstCold?.length).toBe(3)
	})

	it("keeps the earlier cold streak as worst on a tie", () => {
		const rows = rowsFor([L, L, W, L, L])
		const track = computeTrack(rows)
		expect(track.worstCold?.startCallId).toBe(rows[0]?.callId)
	})

	it("gives misses no position, so only wins carry a streak tag", () => {
		const rows = rowsFor([L, L])
		const track = computeTrack(rows)
		expect(track.positions.size).toBe(0)
	})

	it("leaves exactly one of current and currentCold set once a call counts", () => {
		for (const outcomes of [
			[W],
			[L],
			[W, L],
			[L, W],
			[W, S, L],
			[L, L, W, S],
		]) {
			const track = computeTrack(rowsFor(outcomes))
			expect([track.current, track.currentCold].filter(Boolean)).toHaveLength(1)
		}
		const empty = computeTrack(rowsFor([S, S]))
		expect(empty.current).toBeNull()
		expect(empty.currentCold).toBeNull()
	})
})

describe("streakEvents", () => {
	// The events one more batch of results produces on top of `before`.
	function eventsFor(before: Outcome[], after: Outcome[]) {
		const beforeRows = rowsFor(before)
		const afterRows = [
			...beforeRows,
			...after.map((outcome, index) => row(outcome, before.length + index)),
		]
		const next = computeTrack(afterRows)
		return {
			rows: afterRows,
			events: streakEvents(
				snapshot(computeTrack(beforeRows)),
				next,
				nowAfter(afterRows),
			),
		}
	}

	it("announces nothing for a track rebuilt for the first time", () => {
		const rows = rowsFor([W, W, W, W, W])
		expect(streakEvents(null, computeTrack(rows), nowAfter(rows))).toEqual([])
	})

	it("announces a milestone when a run reaches 5", () => {
		const { events } = eventsFor([W, W, W, W], [W])
		expect(events).toEqual([
			expect.objectContaining({
				kind: "streak_milestone",
				length: 5,
				milestone: 5,
			}),
		])
	})

	it("announces only the highest milestone crossed", () => {
		const { events } = eventsFor(Array(9).fill(W), [W, W])
		expect(events).toEqual([
			expect.objectContaining({
				kind: "streak_milestone",
				length: 11,
				milestone: 10,
			}),
		])
	})

	it("doesn't repeat a milestone the run had already reached", () => {
		const { events } = eventsFor(Array(5).fill(W), [W])
		expect(events).toEqual([])
	})

	it("calls a first run to 5 a milestone, not a personal best", () => {
		const { events } = eventsFor([W, W, W, W], [W])
		expect(events.map((e) => e.kind)).toEqual(["streak_milestone"])
	})

	it("announces a personal best, not a milestone, when a run passes an old best", () => {
		const nine = Array(9).fill(W)
		const { events } = eventsFor([...nine, L, ...nine], [W])
		expect(events).toEqual([
			expect.objectContaining({
				kind: "streak_personal_best",
				length: 10,
				previousBest: 9,
			}),
		])
	})

	it("doesn't count a best under 5 as one worth beating", () => {
		const { events } = eventsFor([W, W, W, L, W, W, W], [W])
		expect(events).toEqual([])
	})

	it("announces a snapped streak at the length it ended", () => {
		const { rows, events } = eventsFor(Array(6).fill(W), [L])
		expect(events).toEqual([
			{ kind: "streak_snapped", length: 6, runStartCallId: rows[0]?.callId },
		])
	})

	it("doesn't call a run snapped when an overturn rewrote its middle", () => {
		const beforeRows = rowsFor(Array(6).fill(W))
		const overturned = beforeRows.map((r, index) =>
			index === 2 ? { ...r, outcome: L } : r,
		)
		const events = streakEvents(
			snapshot(computeTrack(beforeRows)),
			computeTrack(overturned),
			nowAfter(overturned),
		)
		expect(events).toEqual([])
	})

	it("doesn't snap a run too short to announce", () => {
		const { events } = eventsFor([W, W, W, W], [L])
		expect(events).toEqual([])
	})

	it("announces nothing once the newest result is stale", () => {
		const beforeRows = rowsFor([W, W, W, W])
		const afterRows = [...beforeRows, row(W, 4)]
		const stale = new Date(
			(afterRows[4]?.realizedAt.getTime() ?? 0) + ACHIEVEMENT_FRESH_MS + 60_000,
		)
		expect(
			streakEvents(
				snapshot(computeTrack(beforeRows)),
				computeTrack(afterRows),
				stale,
			),
		).toEqual([])
	})
})

describe("computeSlateSweeps", () => {
	const question = (
		id: string,
		status: SlateQuestion["status"] = "resolved",
	): SlateQuestion => ({
		questionId: id,
		status,
		startsAt: at(0),
		realizedAt: at(3),
	})
	const outcomes = (entries: Record<string, Record<string, Outcome>>) =>
		new Map(
			Object.entries(entries).map(([userId, byQuestion]) => [
				userId,
				new Map(Object.entries(byQuestion)),
			]),
		)

	it("needs at least 3 games", () => {
		const result = computeSlateSweeps(
			[question("a"), question("b")],
			outcomes({ u: { a: W, b: W } }),
		)
		expect(result.sweptUserIds).toEqual([])
	})

	it("drops a voided game from the count", () => {
		const result = computeSlateSweeps(
			[question("a"), question("b"), question("c"), question("d", "voided")],
			outcomes({ u: { a: W, b: W, c: W, d: L } }),
		)
		expect(result.gameCount).toBe(3)
		expect(result.sweptUserIds).toEqual(["u"])
	})

	it("has no sweep when a void leaves fewer than 3 games", () => {
		const result = computeSlateSweeps(
			[question("a"), question("b"), question("c", "voided")],
			outcomes({ u: { a: W, b: W } }),
		)
		expect(result.sweptUserIds).toEqual([])
	})

	it("waits for every game in the slate", () => {
		const result = computeSlateSweeps(
			[question("a"), question("b"), question("c"), question("d", "locked")],
			outcomes({ u: { a: W, b: W, c: W } }),
		)
		expect(result.final).toBe(false)
		expect(result.sweptUserIds).toEqual([])
	})

	it("needs a winning call on every game", () => {
		const result = computeSlateSweeps(
			[question("a"), question("b"), question("c")],
			outcomes({
				perfect: { a: W, b: W, c: W },
				missedOne: { a: W, b: L, c: W },
				skippedOne: { a: W, c: W },
				unscored: { a: W, b: S, c: W },
			}),
		)
		expect(result.sweptUserIds).toEqual(["perfect"])
	})

	it("counts a disputed game at its current result", () => {
		const result = computeSlateSweeps(
			[question("a"), question("b", "disputed"), question("c")],
			outcomes({ u: { a: W, b: W, c: W } }),
		)
		expect(result.sweptUserIds).toEqual(["u"])
	})
})

describe("canonicalWinnerQuestion", () => {
	const candidate = (
		id: string,
		overrides: Partial<Parameters<typeof canonicalWinnerQuestion>[2][number]>,
	) => ({
		id,
		generationKey: null,
		isOfficial: true,
		resolutionMode: "system" as const,
		createdAt: at(0),
		...overrides,
	})

	it("prefers the question the sync posted", () => {
		const picked = canonicalWinnerQuestion("nfl", "game-1", [
			candidate("admin-made", { createdAt: at(-5) }),
			candidate("synced", { generationKey: "nfl:game-1:team_vs_team" }),
		])
		expect(picked?.id).toBe("synced")
	})

	it("falls back to the earliest official system question", () => {
		const picked = canonicalWinnerQuestion("nfl", "game-1", [
			candidate("later", { createdAt: at(2) }),
			candidate("earlier", { createdAt: at(1) }),
			candidate("manual", { createdAt: at(0), resolutionMode: "manual" }),
		])
		expect(picked?.id).toBe("earlier")
	})

	it("has none when nothing qualifies", () => {
		expect(
			canonicalWinnerQuestion("nfl", "game-1", [
				candidate("user-made", { isOfficial: false }),
			]),
		).toBeNull()
	})
})

describe("streakAwards", () => {
	// Each win scores 10 x its position in the list, so every award's points
	// say which wins it was paid from.
	const scored = (outcomes: Outcome[]): ScoredTrackRow[] =>
		rowsFor(outcomes).map((r, index) => ({
			...r,
			points: r.outcome === "win" ? 10 * (index + 1) : -50,
			seasonId: "season-1",
		}))
	const wins = (n: number) => Array.from({ length: n }, () => W)

	it("pays nothing short of the first step", () => {
		expect(streakAwards(scored(wins(STREAK_BONUS_STEP - 1)))).toEqual([])
	})

	it("pays a share of the wins that reached each step", () => {
		const rows = scored(wins(STREAK_BONUS_STEP * 2))
		const first = rows[0]?.callId
		const block = (from: number) =>
			rows
				.slice(from, from + STREAK_BONUS_STEP)
				.reduce((sum, r) => sum + r.points, 0)

		expect(streakAwards(rows)).toEqual([
			{
				sourceKey: `${first}:${STREAK_BONUS_STEP}`,
				seasonId: "season-1",
				points: Math.round(block(0) * STREAK_BONUS_SHARE),
			},
			{
				sourceKey: `${first}:${STREAK_BONUS_STEP * 2}`,
				seasonId: "season-1",
				points: Math.round(block(STREAK_BONUS_STEP) * STREAK_BONUS_SHARE),
			},
		])
	})

	it("starts over after a miss, and lets a skip pass", () => {
		const almost = wins(STREAK_BONUS_STEP - 1)
		expect(streakAwards(scored([...almost, L, ...almost]))).toEqual([])
		expect(streakAwards(scored([...almost, S, W]))).toHaveLength(1)
	})
})

describe("sweepAwardPoints", () => {
	it("pays a share of what the winner calls scored", () => {
		expect(sweepAwardPoints([100, 50, 30])).toBe(
			Math.round(180 * SWEEP_BONUS_SHARE),
		)
	})
})
