import { useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"
import { useGqlMutation } from "#/graphql/hooks"
import {
	ImportWatchQuizAnswersDocument,
	invalidateWatchQuiz,
} from "#/graphql/were-you-watching/mutations"
import { takeGuestWatchRuns } from "#/stores/watch-quiz-store"

// Saves the Were You Watching? runs a player made before signing up, as
// soon as there's an account to save them to, on whatever page signing up
// landed on. The API only takes a quiz that's still up, and only onto an
// account that hasn't played it.
export function useImportWatchQuiz(viewerId: string | null) {
	const queryClient = useQueryClient()
	const importAnswers = useGqlMutation(ImportWatchQuizAnswersDocument)

	// biome-ignore lint/correctness/useExhaustiveDependencies: once per viewer
	useEffect(() => {
		if (!viewerId) return
		const runs = takeGuestWatchRuns()
		if (runs.length === 0) return
		void Promise.all(
			runs.map((run) =>
				importAnswers
					.mutateAsync({
						quizId: run.quizId,
						answers: run.answers,
						clean: run.clean,
					})
					.catch(() => {}),
			),
		).then(() => invalidateWatchQuiz(queryClient))
	}, [viewerId])
}
