import { useQuery } from "@tanstack/react-query"
import { css } from "styled-system/css"
import { QuestionCard } from "#/components/questions/question-card"
import { CardRail } from "#/components/ui/card-rail"
import { closingSoonQuery } from "./season-question-feed-query"

// The list's questions locking in the next 48 hours, ahead of it and
// untouched by its search and sort. Renders nothing when none qualify.
export function ClosingSoonRow({ leagueId }: { leagueId: string }) {
	const { data } = useQuery(closingSoonQuery(leagueId))
	const questions = data?.questions.items ?? []

	if (questions.length === 0) return null

	return (
		<section aria-label="Closing soon">
			<CardRail
				items={questions}
				getKey={(question) => question.id}
				renderItem={(question) => <QuestionCard question={question} />}
				itemLabel="question"
				header={
					<span
						className={css({
							textStyle: "label",
							color: "fg.default",
							fontWeight: "bold",
						})}
					>
						Closing soon
					</span>
				}
			/>
		</section>
	)
}
