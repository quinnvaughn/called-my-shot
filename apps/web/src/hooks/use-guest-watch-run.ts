import { useEffect, useMemo, useState } from "react"
import type {
	WatchRun,
	WatchRunView,
	WatchServed,
} from "#/components/arcade/were-you-watching/watch-run"
import { gqlFetch } from "#/graphql/fetcher"
import {
	JudgeWatchGuestAnswerDocument,
	WatchGuestQuestionDocument,
} from "#/graphql/were-you-watching/queries"
import {
	freshGuestWatchRun,
	type GuestWatchRun,
	restoreGuestWatchRun,
	saveGuestWatchRun,
} from "#/stores/watch-quiz-store"

type Open = { served: WatchServed; shownAt: number; deadline: number }

// A signed-out run. The questions still come one at a time from the API,
// which judges each answer, but the clock and the run live in the browser
// until signing up saves it (useImportWatchQuiz).
export function useGuestWatchRun({
	quizId,
	questionCount,
	keep = true,
}: {
	quizId: string
	questionCount: number
	// False for an admin's practice run, which isn't saved anywhere.
	keep?: boolean
}): WatchRun {
	// Restored from the browser after mount.
	const [run, setRun] = useState<GuestWatchRun>(() =>
		freshGuestWatchRun(quizId),
	)
	useEffect(() => {
		if (keep) setRun(restoreGuestWatchRun(quizId))
	}, [quizId, keep])
	const [open, setOpen] = useState<Open | null>(null)
	const [pending, setPending] = useState(false)
	const [error, setError] = useState<string | null>(null)

	function update(next: GuestWatchRun) {
		setRun(next)
		if (keep) saveGuestWatchRun(next)
	}

	async function serve(index: number) {
		setPending(true)
		try {
			const data = await gqlFetch(WatchGuestQuestionDocument, { quizId, index })
			const served = data.watchGuestQuestion
			if (
				served.__typename !== "WatchServedQuestion" ||
				!("prompt" in served)
			) {
				setError("message" in served ? served.message : "That quiz has closed.")
				return
			}
			setError(null)
			const now = Date.now()
			setOpen({ served, shownAt: now, deadline: now + served.msLeft })
		} finally {
			setPending(false)
		}
	}

	async function answer(choice: number | null) {
		if (!open) return
		const ms = Math.min(Date.now() - open.shownAt, open.served.msLeft)
		const index = open.served.index
		setOpen(null)
		setPending(true)
		try {
			const data = await gqlFetch(JudgeWatchGuestAnswerDocument, {
				quizId,
				index,
				choice,
				ms,
			})
			const judged = data.judgeWatchGuestAnswer
			if (
				judged.__typename !== "WatchAnsweredQuestion" ||
				!("prompt" in judged)
			) {
				setError("message" in judged ? judged.message : "That quiz has closed.")
				return
			}
			update({
				...run,
				answers: [...run.answers, { choice, ms }],
				answered: [...run.answered, judged],
			})
		} finally {
			setPending(false)
		}
	}

	const view = useMemo((): WatchRunView => {
		const done = run.answered.length >= questionCount
		return {
			status: done
				? "done"
				: open
					? "open"
					: run.answered.length > 0
						? "between"
						: "not_started",
			current: open ? { ...open.served, deadline: open.deadline } : null,
			answered: run.answered,
			correct: run.answered.filter((a) => a.correct).length,
			total: questionCount,
			totalMs: run.answers.reduce((sum, a) => sum + a.ms, 0),
			clean: run.clean,
			rank: null,
		}
	}, [run, open, questionCount])

	return {
		view,
		pending,
		error,
		start: () => void serve(0),
		next: () => void serve(run.answered.length),
		answer: (choice) => void answer(choice),
		markHidden: () => {
			if (run.clean) update({ ...run, clean: false })
		},
	}
}
