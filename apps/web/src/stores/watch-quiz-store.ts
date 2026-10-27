import type { WatchAnswered } from "#/components/arcade/were-you-watching/watch-run"

// A signed-out player's Were You Watching? runs, one per quiz, held in the
// browser until they have an account to save them to (see
// useImportWatchQuiz). `answers` is what gets saved; `answered` is the
// judged questions the result screen shows.
export type GuestWatchRun = {
	quizId: string
	answers: { choice: number | null; ms: number }[]
	answered: WatchAnswered[]
	clean: boolean
}

const STORAGE_KEY = "cms.watchQuiz.v1"

function readAll(): Record<string, GuestWatchRun> {
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY)
		const parsed: unknown = raw ? JSON.parse(raw) : null
		if (!parsed || typeof parsed !== "object") return {}
		return Object.fromEntries(
			Object.entries(parsed as Record<string, GuestWatchRun>).filter(
				([, run]) =>
					run &&
					typeof run.quizId === "string" &&
					Array.isArray(run.answers) &&
					Array.isArray(run.answered),
			),
		)
	} catch {
		return {}
	}
}

function writeAll(runs: Record<string, GuestWatchRun>) {
	try {
		if (Object.keys(runs).length === 0)
			window.localStorage.removeItem(STORAGE_KEY)
		else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(runs))
	} catch {
		// Blocked or full storage: the run still lives in memory for this visit.
	}
}

export const freshGuestWatchRun = (quizId: string): GuestWatchRun => ({
	quizId,
	answers: [],
	answered: [],
	clean: true,
})

export function restoreGuestWatchRun(quizId: string): GuestWatchRun {
	return readAll()[quizId] ?? freshGuestWatchRun(quizId)
}

export function saveGuestWatchRun(run: GuestWatchRun) {
	writeAll({ ...readAll(), [run.quizId]: run })
}

// Read once and cleared, when there's an account to save them to. Only a
// run with an answer in it is worth saving.
export function takeGuestWatchRuns(): GuestWatchRun[] {
	const runs = Object.values(readAll()).filter((r) => r.answers.length > 0)
	writeAll({})
	return runs
}
