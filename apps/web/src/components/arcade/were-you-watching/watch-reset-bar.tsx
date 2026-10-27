import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { css } from "styled-system/css"
import { ArcadeAdminBar } from "#/components/arcade/arcade-admin-bar"
import { Button } from "#/components/ui/button"
import { useGqlMutation } from "#/graphql/hooks"
import {
	invalidateWatchQuiz,
	RebuildWatchQuizDocument,
	ResetMyWatchPlayDocument,
} from "#/graphql/were-you-watching/mutations"
import { adminWatchQuizQuery } from "#/graphql/were-you-watching/queries"

// Above a team's quiz for an admin: their own run deleted so it can be
// played again, the quiz rebuilt from the box score, and its answers.
export function WatchResetBar({ quizId }: { quizId: string }) {
	const queryClient = useQueryClient()
	const reset = useGqlMutation(ResetMyWatchPlayDocument)
	const rebuild = useGqlMutation(RebuildWatchQuizDocument)
	const [showAnswers, setShowAnswers] = useState(false)
	const [message, setMessage] = useState<string | null>(null)
	const { data } = useQuery({
		...adminWatchQuizQuery(quizId),
		enabled: showAnswers,
	})
	const admin =
		data?.adminWatchQuiz.__typename === "WatchQuizAdmin" &&
		"questions" in data.adminWatchQuiz
			? data.adminWatchQuiz
			: null

	async function runReset() {
		await reset.mutateAsync({ quizId })
		await invalidateWatchQuiz(queryClient)
	}

	async function runRebuild() {
		const result = await rebuild.mutateAsync({ quizId })
		const refused = result.rebuildWatchQuiz
		setMessage(
			"fieldErrors" in refused
				? (refused.fieldErrors[0]?.message ?? "Couldn't rebuild it.")
				: "Rebuilt from the box score.",
		)
		await invalidateWatchQuiz(queryClient)
	}

	return (
		<div
			className={css({ display: "flex", flexDirection: "column", gap: "2" })}
		>
			<ArcadeAdminBar label="Admin · this quiz">
				<Button
					variant="outline"
					size="sm"
					onClick={() => setShowAnswers((v) => !v)}
				>
					{showAnswers ? "Hide answers" : "Answers"}
				</Button>
				<Button
					variant="outline"
					size="sm"
					loading={rebuild.isPending}
					onClick={() => void runRebuild()}
				>
					Rebuild
				</Button>
				<Button
					variant="outline"
					size="sm"
					loading={reset.isPending}
					onClick={() => void runReset()}
				>
					Reset my run
				</Button>
			</ArcadeAdminBar>
			{message && (
				<p className={css({ textStyle: "label", color: "fg.muted" })}>
					{message}
				</p>
			)}
			{admin && (
				<ol
					className={css({
						display: "flex",
						flexDirection: "column",
						gap: "2",
						fontSize: "sm",
						paddingLeft: "5",
						listStyle: "decimal",
						marginBottom: "4",
					})}
				>
					{admin.questions.map((q) => (
						<li key={q.prompt}>
							<strong>{q.prompt}</strong> {q.options[q.answer]} ({q.template})
						</li>
					))}
				</ol>
			)}
		</div>
	)
}
