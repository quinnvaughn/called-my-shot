import type { QuestionShape } from "#/graphql/generated/graphql"

// A game's official questions in the order the game page reads them: the
// who-wins question first, then one section per kind of call. Shared by the
// game page and GameStrip so the two can't disagree on what comes next.

// Each names the kind of call its questions are, so a new catalog template
// lands in its shape's section and a new shape needs a section of its own
// here. Any other official question on the game (an admin's own) goes under
// More.
//
// The game total comes first: after who wins, how much scoring there'll be is
// the call that needs the least knowledge of either roster.
const OFFICIAL_SECTIONS: { label: string; shapes: QuestionShape[] }[] = [
	{ label: "Game total", shapes: ["GAME_TOTAL_OVER_UNDER"] },
	{
		label: "Team lines",
		shapes: ["TEAM_STAT_OVER_UNDER", "TEAM_STAT_NUMERIC_GUESS"],
	},
	{ label: "Head to head", shapes: ["PLAYER_VS_PLAYER"] },
	{ label: "Player lines", shapes: ["PLAYER_STAT_OVER_UNDER"] },
	{ label: "Game leader", shapes: ["PLAYER_GAME_STAT_LEADER"] },
]

export const GAME_WINNER_LABEL = "Game winner"

const MORE_SECTION_LABEL = "More"

type OrderableQuestion = { id: string; shape: QuestionShape; createdAt: string }

// The "who will win?" question synced onto every game by syncGameQuestions
// (apps/api/src/db/sync/sync-game-questions.ts). Undefined before that sync
// has run.
export function findGameWinnerQuestion<T extends OrderableQuestion>(
	questions: T[],
): T | undefined {
	return questions.find((q) => q.shape === "TEAM_VS_TEAM")
}

// Oldest first within a section, which is the order the catalog posts them
// in (away team before home). Empty sections are dropped.
export function sectionOfficialQuestions<T extends OrderableQuestion>(
	questions: T[],
): { label: string; questions: T[] }[] {
	const byAge = (a: T, b: T) =>
		new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
	const sectioned = new Set(OFFICIAL_SECTIONS.flatMap((s) => s.shapes))
	return [
		...OFFICIAL_SECTIONS.map((section) => ({
			label: section.label,
			questions: questions.filter((q) => section.shapes.includes(q.shape)),
		})),
		{
			label: MORE_SECTION_LABEL,
			questions: questions.filter((q) => !sectioned.has(q.shape)),
		},
	]
		.map((section) => ({
			...section,
			questions: [...section.questions].sort(byAge),
		}))
		.filter((section) => section.questions.length > 0)
}

// Every official question as one flat run, each tagged with the section it
// sits under: the game winner, then the sections above.
export function officialQuestionSequence<T extends OrderableQuestion>(
	questions: T[],
): { section: string; question: T }[] {
	const winner = findGameWinnerQuestion(questions)
	const rest = questions.filter((q) => q.id !== winner?.id)
	return [
		...(winner ? [{ section: GAME_WINNER_LABEL, question: winner }] : []),
		...sectionOfficialQuestions(rest).flatMap((section) =>
			section.questions.map((question) => ({
				section: section.label,
				question,
			})),
		),
	]
}
