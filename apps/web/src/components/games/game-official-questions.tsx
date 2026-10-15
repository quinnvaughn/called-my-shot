import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { EmptyState } from "#/components/ui/empty-state"
import type { GameByIdQuery } from "#/graphql/generated/graphql"
import { sectionOfficialQuestions } from "#/lib/official-game-questions"
import { GameOfficialCard, type GameQuestion } from "./game-official-card"

type GameData = NonNullable<GameByIdQuery["game"]>

const sectionLabelClass = css({
	textStyle: "label",
	color: "fg.subtle",
})

export function GameOfficialQuestions({
	game,
	questions,
}: {
	game: GameData
	questions: GameQuestion[]
}) {
	const sections = sectionOfficialQuestions(questions)

	if (sections.length === 0) {
		// Catalog questions only go up inside generate-game-questions.ts's
		// window, so a game further out has just its who-wins question until
		// then.
		if (game.postseason?.ifNecessary) {
			return (
				<EmptyState>
					This game is only played if the series is still going. Questions go up
					once it is.
				</EmptyState>
			)
		}
		if (game.status === "SCHEDULED" && game.startTimeTbd) {
			return (
				<EmptyState>
					Questions go up once this game has a start time.
				</EmptyState>
			)
		}
		if (game.status === "SCHEDULED") {
			return (
				<EmptyState>
					{game.league.windowType === "WEEK"
						? "More official questions go up once this game's week is next on the schedule."
						: "More official questions go up about a day before the game."}
				</EmptyState>
			)
		}
		return <EmptyState>No other official questions on this game.</EmptyState>
	}

	return (
		<VStack gap="6" alignItems="stretch">
			{sections.map((section) => (
				<VStack key={section.label} gap="2" alignItems="stretch">
					<span className={sectionLabelClass}>{section.label}</span>
					<VStack gap="3" alignItems="stretch">
						{section.questions.map((question) => (
							<GameOfficialCard key={question.id} question={question} />
						))}
					</VStack>
				</VStack>
			))}
		</VStack>
	)
}
