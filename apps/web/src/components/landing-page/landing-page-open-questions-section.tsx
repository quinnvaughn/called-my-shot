import { Grid } from "styled-system/jsx"
import {
	QuestionCard,
	type QuestionCardFragment,
} from "#/components/questions/question-card"
import type { FragmentType } from "#/graphql/generated"
import { LandingPageContentSection } from "./landing-page-content-section"

type Props = {
	questions: ({ id: string } & FragmentType<typeof QuestionCardFragment>)[]
}

export function LandingPageOpenQuestionsSection({ questions }: Props) {
	if (questions.length === 0) {
		return null
	}

	return (
		<LandingPageContentSection
			id="open-now"
			eyebrow="Live right now"
			title="Open right now."
			description="Real games, scoring live, locking on the clock."
		>
			<Grid
				gridTemplateColumns={{
					base: "1fr",
					md: "1fr 1fr",
					xl: "repeat(3, 1fr)",
				}}
				gap="5"
				width="full"
			>
				{questions.map((question) => (
					<QuestionCard key={question.id} question={question} />
				))}
			</Grid>
		</LandingPageContentSection>
	)
}
