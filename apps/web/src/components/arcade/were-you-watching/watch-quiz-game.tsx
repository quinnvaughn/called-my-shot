import { watchResultCode } from "@called-my-shot/schemas"
import { useEffect, useRef, useState } from "react"
import { css } from "styled-system/css"
import { ArcadeCallsLine } from "#/components/arcade/arcade-calls-line"
import { ArcadeNextSteps } from "#/components/arcade/arcade-next-steps"
import type {
	WatchPlay_PlayFragment,
	WatchQuiz_QuizFragment,
} from "#/graphql/generated/graphql"
import { useGuestWatchRun } from "#/hooks/use-guest-watch-run"
import { useMe } from "#/hooks/use-me"
import { useSavedWatchRun } from "#/hooks/use-saved-watch-run"
import { useWatchVisibility } from "#/hooks/use-watch-visibility"
import { track } from "#/lib/analytics"
import { SITE_ORIGIN } from "#/lib/meta"
import { WatchAnswerReveal } from "./watch-answer-reveal"
import { watchResultPath } from "./watch-codes"
import { WatchQuestionCard } from "./watch-question-card"
import { WatchQuizHeader } from "./watch-quiz-header"
import { WatchResult } from "./watch-result"
import { WatchStartPanel } from "./watch-start-panel"

// A team's quiz, start to result. Signed in, the server serves and times
// each question and saves each answer. Signed out, the questions still come
// one at a time and the API judges them, but the run lives in the browser
// until signing up saves it (useImportWatchQuiz).
export function WatchQuizGame({
	quiz,
	viewerPlay,
	leagueSlug,
	teamSlug,
}: {
	quiz: WatchQuiz_QuizFragment
	viewerPlay: WatchPlay_PlayFragment | null
	leagueSlug: string
	teamSlug: string
}) {
	const me = useMe()
	const saved = useSavedWatchRun({
		quizId: quiz.id,
		questionCount: quiz.questionCount,
		play: viewerPlay,
		leagueSlug,
		teamSlug,
	})
	const guest = useGuestWatchRun({
		quizId: quiz.id,
		questionCount: quiz.questionCount,
	})
	const run = me ? saved : guest
	const { view } = run
	// The last question was just answered here, so its answer shows before
	// the result does. A run that was already over when the page loaded goes
	// straight to the result.
	const [revealingLast, setRevealingLast] = useState(false)
	const answer = (choice: number | null) => {
		if (view.current?.index === view.total - 1) setRevealingLast(true)
		run.answer(choice)
	}
	const analytics = { league: leagueSlug, team: teamSlug, code: quiz.code }

	useWatchVisibility(view.status === "open", () => {
		if (!view.clean) return
		track("watch_tab_hidden", {
			code: quiz.code,
			index: view.current?.index ?? 0,
		})
		run.markHidden()
	})

	// Analytics as each answer comes back. The answers seen on first load
	// are the baseline, so a run restored from earlier isn't reported again.
	const seen = useRef<number | null>(null)
	useEffect(() => {
		if (seen.current === null) {
			seen.current = view.answered.length
			return
		}
		if (view.answered.length <= seen.current) return
		seen.current = view.answered.length
		const last = view.answered.at(-1)
		if (last) {
			track("watch_question_answered", {
				code: quiz.code,
				index: last.index,
				correct: last.correct,
				timedOut: last.timedOut,
			})
		}
		if (view.status === "done") {
			track("watch_quiz_finished", {
				...analytics,
				correct: view.correct,
				total: view.total,
				seconds: view.totalMs / 1000,
				clean: view.clean,
				signedIn: !!me,
			})
		}
	})

	if (view.status === "not_started") {
		return (
			<WatchStartPanel
				teamName={quiz.team.name}
				opponentName={quiz.opponent.name}
				gameStartsAt={quiz.gameStartsAt}
				league={quiz.league.abbreviation}
				questionCount={quiz.questionCount}
				secondsPerQuestion={quiz.secondsPerQuestion}
				signedIn={!!me}
				pending={run.pending}
				error={run.error}
				onStart={() => {
					track("watch_quiz_started", { ...analytics, signedIn: !!me })
					run.start()
				}}
			/>
		)
	}

	const last = view.answered.at(-1)
	if (view.status === "done" && revealingLast && last) {
		return (
			<div
				className={css({ display: "flex", flexDirection: "column", gap: "5" })}
			>
				<WatchQuizHeader
					team={quiz.team}
					opponent={quiz.opponent}
					gameStartsAt={quiz.gameStartsAt}
					league={quiz.league.abbreviation}
				/>
				<WatchAnswerReveal
					answered={last}
					total={view.total}
					pending={false}
					nextLabel="See your result"
					onNext={() => setRevealingLast(false)}
				/>
			</div>
		)
	}

	if (view.status === "done") {
		const resultCode = watchResultCode({
			correct: view.correct,
			total: view.total,
			totalMs: view.totalMs,
			clean: view.clean,
		})
		const resultUrl = `${SITE_ORIGIN}${watchResultPath(leagueSlug, teamSlug, quiz.code, resultCode, me?.username)}`
		const onShared = (method: "clipboard" | "native" | "x", toGroup: boolean) =>
			track("watch_result_shared", { code: quiz.code, method, toGroup })
		return (
			<div
				className={css({ display: "flex", flexDirection: "column", gap: "6" })}
			>
				<WatchResult
					view={view}
					teamName={quiz.team.name}
					opponentName={quiz.opponent.name}
					playerCount={quiz.playerCount}
					resultUrl={resultUrl}
					onShared={(method) => onShared(method, false)}
				/>
				<ArcadeNextSteps
					game="watch"
					watchQuizId={quiz.id}
					resultUrl={resultUrl}
					onStep={(step) => track("watch_next_step_clicked", { step })}
					onShared={(method) => onShared(method, true)}
				/>
				<ArcadeCallsLine
					onClick={() => track("watch_next_step_clicked", { step: "calls" })}
				/>
			</div>
		)
	}

	return (
		<div
			className={css({ display: "flex", flexDirection: "column", gap: "5" })}
		>
			<WatchQuizHeader
				team={quiz.team}
				opponent={quiz.opponent}
				gameStartsAt={quiz.gameStartsAt}
				league={quiz.league.abbreviation}
			/>
			{view.status === "open" && view.current ? (
				<WatchQuestionCard
					key={view.current.index}
					question={view.current}
					deadline={view.current.deadline}
					total={view.total}
					secondsPerQuestion={quiz.secondsPerQuestion}
					pending={run.pending}
					onChoose={answer}
				/>
			) : last ? (
				<WatchAnswerReveal
					answered={last}
					total={view.total}
					pending={run.pending}
					onNext={run.next}
				/>
			) : null}
			{run.error && (
				<p role="alert" className={css({ color: "danger.default" })}>
					{run.error}
				</p>
			)}
		</div>
	)
}
