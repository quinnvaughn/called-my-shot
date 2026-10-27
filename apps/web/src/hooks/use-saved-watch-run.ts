import { useQueryClient } from "@tanstack/react-query"
import { useRef, useState } from "react"
import { match } from "ts-pattern"
import type {
	WatchRun,
	WatchRunView,
} from "#/components/arcade/were-you-watching/watch-run"
import { gqlFetch } from "#/graphql/fetcher"
import type {
	WatchPlay_PlayFragment,
	WatchTeamQuizQuery,
} from "#/graphql/generated/graphql"
import { useGqlMutation } from "#/graphql/hooks"
import {
	AnswerWatchQuestionDocument,
	invalidateWatchQuiz,
	NextWatchQuestionDocument,
	ReportWatchHiddenDocument,
	StartWatchQuizDocument,
} from "#/graphql/were-you-watching/mutations"
import { watchTeamQuizQuery } from "#/graphql/were-you-watching/queries"

type PlayResult =
	| ({ __typename: "WatchPlay" } & WatchPlay_PlayFragment)
	| {
			__typename: "ValidationError"
			fieldErrors: { field: string | null; message: string }[]
	  }
	| { __typename: "NotFoundError"; message: string }
	| { __typename: string }

// A signed-in run. Every question is served and timed by the server, and
// each answer is saved as it's made, so a reload picks up where it was with
// the clock still running.
export function useSavedWatchRun({
	quizId,
	questionCount,
	play,
	leagueSlug,
	teamSlug,
}: {
	quizId: string
	questionCount: number
	play: WatchPlay_PlayFragment | null
	leagueSlug: string
	teamSlug: string
}): WatchRun {
	const queryClient = useQueryClient()
	const start = useGqlMutation(StartWatchQuizDocument)
	const next = useGqlMutation(NextWatchQuestionDocument)
	const answer = useGqlMutation(AnswerWatchQuestionDocument)
	const [error, setError] = useState<string | null>(null)

	const query = watchTeamQuizQuery(leagueSlug, teamSlug)

	function setPlay(
		update: (old: WatchPlay_PlayFragment) => WatchPlay_PlayFragment,
	) {
		queryClient.setQueryData(
			query.queryKey,
			(old: WatchTeamQuizQuery | undefined) => {
				const quiz = old?.watchTeamQuiz?.quiz
				if (!old?.watchTeamQuiz || !quiz?.viewerPlay) return old
				return {
					watchTeamQuiz: {
						...old.watchTeamQuiz,
						quiz: { ...quiz, viewerPlay: update(quiz.viewerPlay) },
					},
				}
			},
		)
	}

	function apply(result: PlayResult) {
		if (result.__typename === "ValidationError" && "fieldErrors" in result) {
			setError(result.fieldErrors[0]?.message ?? "That didn't count.")
			return
		}
		if (result.__typename === "NotFoundError" && "message" in result) {
			setError(result.message)
			return
		}
		if (result.__typename !== "WatchPlay" || !("status" in result)) return
		setError(null)
		queryClient.setQueryData(
			query.queryKey,
			(old: WatchTeamQuizQuery | undefined) => {
				const quiz = old?.watchTeamQuiz?.quiz
				if (!old?.watchTeamQuiz || !quiz) return old
				return {
					watchTeamQuiz: {
						...old.watchTeamQuiz,
						quiz: { ...quiz, viewerPlay: result },
					},
				}
			},
		)
		if (result.status === "DONE") void invalidateWatchQuiz(queryClient)
	}

	// The clock's end on this device, from the time the server said was left
	// when it first sent the question. Held per question, so the play being
	// rewritten in the cache (losing the Clean run tag) doesn't restart it.
	const deadline = useRef<{ index: number; at: number } | null>(null)
	function deadlineFor(current: { index: number; msLeft: number }) {
		if (deadline.current?.index !== current.index) {
			deadline.current = {
				index: current.index,
				at: Date.now() + current.msLeft,
			}
		}
		return deadline.current.at
	}

	const view = ((): WatchRunView => {
		if (!play) {
			return {
				status: "not_started",
				current: null,
				answered: [],
				correct: 0,
				total: questionCount,
				totalMs: 0,
				clean: true,
				rank: null,
			}
		}
		return {
			status: match(play.status)
				.with("OPEN", () => "open" as const)
				.with("BETWEEN", () => "between" as const)
				.with("DONE", () => "done" as const)
				.exhaustive(),
			current: play.current
				? { ...play.current, deadline: deadlineFor(play.current) }
				: null,
			answered: play.answered,
			correct: play.correctCount,
			total: play.total,
			totalMs: Math.round(play.seconds * 1000),
			clean: play.clean,
			rank: play.rank ?? null,
		}
	})()

	return {
		view,
		pending: start.isPending || next.isPending || answer.isPending,
		error,
		start: () => {
			void start.mutateAsync({ quizId }).then((d) => apply(d.startWatchQuiz))
		},
		next: () => {
			void next.mutateAsync({ quizId }).then((d) => apply(d.nextWatchQuestion))
		},
		answer: (choice) => {
			const index = view.current?.index
			if (index === undefined) return
			void answer
				.mutateAsync({ quizId, index, choice })
				.then((d) => apply(d.answerWatchQuestion))
		},
		markHidden: () => {
			setPlay((old) => ({ ...old, clean: false }))
			void gqlFetch(ReportWatchHiddenDocument, { quizId }, { keepalive: true })
		},
	}
}
