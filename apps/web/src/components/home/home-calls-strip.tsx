import { useSuspenseQuery } from "@tanstack/react-query"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { LiveCallsSection } from "#/components/my-calls/live-calls-section"
import { QuestionCard } from "#/components/questions/question-card"
import { CardRail } from "#/components/ui/card-rail"
import { homeDashboardQuery } from "#/graphql/home/queries"

// Above Home's feed: the viewer's calls on games being played right now,
// then questions about to lock, each a sideways row so the feed starts
// close to the top. Gone entirely when both are empty.
export function HomeCallsStrip() {
	const { data } = useSuspenseQuery(homeDashboardQuery)
	const lockingSoon = data.questions.items
	if (data.myLiveCalls.length === 0 && lockingSoon.length === 0) return null

	return (
		<VStack gap="5" alignItems="stretch">
			<LiveCallsSection filters={{}} />
			{lockingSoon.length > 0 && (
				<section aria-label="Locking soon">
					<CardRail
						items={lockingSoon}
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
								Locking soon
							</span>
						}
					/>
				</section>
			)}
		</VStack>
	)
}
