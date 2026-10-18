import { GameCardContext } from "#/components/games/game-card-context"
import { GameCardStreak } from "#/components/games/game-card-streak"
import { QuestionCard } from "#/components/questions/question-card"
import type { GameOfficialQuestionsQuery } from "#/graphql/generated/graphql"

export type GameQuestion =
	GameOfficialQuestionsQuery["questions"]["items"][number]

export function GameOfficialCard({ question }: { question: GameQuestion }) {
	return (
		<QuestionCard
			question={question}
			showGame={false}
			pickable
			trailing={<GameCardStreak question={question} />}
			context={<GameCardContext question={question} />}
		/>
	)
}
