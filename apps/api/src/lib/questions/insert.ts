import {
	type Player,
	type Question,
	questionOptions,
	questions,
	type Team,
} from "../../db/schema"
import type { Tx } from "../../db/types"

type NewQuestion = typeof questions.$inferInsert

// The columns every question carries, whatever its shape.
export type QuestionBase = Pick<
	NewQuestion,
	| "shape"
	| "title"
	| "creatorId"
	| "isOfficial"
	| "sportId"
	| "leagueId"
	| "seasonId"
	| "resolutionSource"
	| "locksAt"
	| "lossRate"
> &
	Partial<
		Pick<NewQuestion, "gameId" | "resolutionMode" | "resolutionSourceUrl">
	>

// Everything else a shape may set: its stat, line, subject, award scope.
export type QuestionShapeFields = Omit<
	NewQuestion,
	keyof QuestionBase | "id" | "createdAt"
>

// An option as its source describes it. Position comes from its place in the
// list handed to insertQuestion.
export type OptionRow = Omit<
	typeof questionOptions.$inferInsert,
	"id" | "questionId" | "sortOrder"
>

// Inserts a question and its options in list order (sortOrder 0, 1, ...),
// the order every consumer of Question.options renders them in.
export async function insertQuestion(
	tx: Tx,
	base: QuestionBase,
	shapeFields: QuestionShapeFields,
	options: OptionRow[],
): Promise<Question> {
	const [question] = await tx
		.insert(questions)
		.values({ ...base, ...shapeFields })
		.returning()
	if (!question) throw new Error("insertQuestion: insert returned nothing")
	if (options.length > 0) {
		await tx.insert(questionOptions).values(
			options.map((option, index) => ({
				...option,
				questionId: question.id,
				sortOrder: index,
			})),
		)
	}
	return question
}

export function playerOptions(players: Pick<Player, "id" | "name">[]) {
	return players.map((player) => ({ label: player.name, playerId: player.id }))
}

export function teamOptions(teams: Pick<Team, "id" | "name">[]) {
	return teams.map((team) => ({ label: team.name, teamId: team.id }))
}

// An award's conference/division/position/seasons filter. An empty list and a
// null column both mean "the whole league", and null is what gets stored.
export function listOrNull<T>(list: T[] | null | undefined): T[] | null {
	return list?.length ? list : null
}
