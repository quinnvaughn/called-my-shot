import { parseWatchResultCode, watchResultCode } from "@called-my-shot/schemas"
import type { WatchAnswer, WatchQuestion } from "../../db/schema"
import { GRACE_MS, MIN_ANSWER_MS, QUESTION_MS } from "./leagues"

export type WatchStatus = "open" | "between" | "done"

export type WatchState = {
	status: WatchStatus
	answers: WatchAnswer[]
	// When the question after `answers` was shown, while it's still on the
	// clock.
	openServedAt: Date | null
	correctCount: number
	totalMs: number
	total: number
}

export type WatchRefusal =
	| "finished"
	| "not_open"
	| "wrong_index"
	| "bad_choice"

const timedOut = (servedAt: Date): WatchAnswer => ({
	choice: null,
	servedAt: servedAt.toISOString(),
	answeredAt: null,
	ms: QUESTION_MS,
	correct: false,
})

export const tallyWatchAnswers = (answers: WatchAnswer[]) => ({
	correctCount: answers.filter((a) => a.correct).length,
	totalMs: answers.reduce((sum, a) => sum + a.ms, 0),
})

// Where a run stands at `now`. A question left open past its clock counts
// as timed out, which is how a closed tab ends one. A quiz that's no longer
// up is over however far the run got.
export function evaluateWatchAttempt(
	row: { answers: WatchAnswer[]; openServedAt: Date | null },
	total: number,
	now: Date,
	{ live }: { live: boolean },
): WatchState {
	const answers = [...row.answers]
	let openServedAt = row.openServedAt
	if (
		openServedAt &&
		now.getTime() - openServedAt.getTime() > QUESTION_MS + GRACE_MS
	) {
		answers.push(timedOut(openServedAt))
		openServedAt = null
	}
	const done = answers.length >= total || !live
	return {
		status: done ? "done" : openServedAt ? "open" : "between",
		answers,
		openServedAt: done ? null : openServedAt,
		...tallyWatchAnswers(answers),
		total,
	}
}

// The open question's answer, or why it can't be taken. `choice` null is
// the clock running out on the player's screen.
export function judgeWatchAnswer(
	questions: WatchQuestion[],
	state: WatchState,
	index: number,
	choice: number | null,
	now: Date,
): WatchAnswer | WatchRefusal {
	if (state.status === "done") return "finished"
	if (!state.openServedAt) return "not_open"
	if (index !== state.answers.length) return "wrong_index"
	const question = questions[index]
	if (!question) return "wrong_index"
	if (choice !== null && (choice < 0 || choice >= question.options.length)) {
		return "bad_choice"
	}
	const elapsed = Math.max(0, now.getTime() - state.openServedAt.getTime())
	return {
		choice,
		servedAt: state.openServedAt.toISOString(),
		answeredAt: now.toISOString(),
		ms: choice === null ? QUESTION_MS : Math.min(elapsed, QUESTION_MS),
		correct: choice === question.answer,
	}
}

// A signed-out answer as it's saved on sign-up: its time kept in the
// clock's range, since the browser reported it.
export function guestWatchAnswer(
	question: WatchQuestion,
	choice: number | null,
	ms: number,
	now: Date,
): WatchAnswer {
	const valid =
		choice !== null && choice >= 0 && choice < question.options.length
	return {
		choice: valid ? choice : null,
		servedAt: now.toISOString(),
		answeredAt: valid ? now.toISOString() : null,
		ms: valid
			? Math.min(Math.max(Math.round(ms), MIN_ANSWER_MS), QUESTION_MS)
			: QUESTION_MS,
		correct: valid && choice === question.answer,
	}
}

export const watchSeconds = (totalMs: number) => Math.round(totalMs / 100) / 10

// What a share link carries, in the form the web builds for a signed-out
// run too (see watchResultCode in @called-my-shot/schemas).
export function watchRunCode(run: {
	correctCount: number
	total: number
	totalMs: number
	clean: boolean
}): string {
	return watchResultCode({ ...run, correct: run.correctCount })
}

export { parseWatchResultCode }
