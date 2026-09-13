import { eq } from "drizzle-orm"
import type { db } from "../../db"
import { questions } from "../../db/schema"
import { type GameForTitle, gameQuestionTitle, titleFactsFor } from "./titles"

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

// Every generated question on a game locks when the game starts, and its
// title carries the game's date, so when ESPN moves a game (a flex, a rain
// delay reschedule) both follow it. Only open and locked questions move: a
// resolved or disputed one already has a real-world result attached, so a
// late schedule correction shouldn't change what it says. Returns how many
// questions changed.
export async function refreshGeneratedQuestionSchedule(
	tx: Tx,
	game: GameForTitle & { id: string },
): Promise<number> {
	const generated = await tx.query.questions.findMany({
		where: {
			gameId: game.id,
			generationKey: { isNotNull: true },
			status: { in: ["open", "locked"] },
		},
		with: {
			stat: { columns: { name: true } },
			subjectPlayer: { columns: { name: true } },
			options: { columns: { label: true, sortOrder: true } },
		},
	})

	let updated = 0
	for (const question of generated) {
		const facts = titleFactsFor(question)
		const title = facts ? gameQuestionTitle(facts, game) : question.title
		if (
			question.locksAt.getTime() === game.startsAt.getTime() &&
			question.title === title
		) {
			continue
		}
		await tx
			.update(questions)
			.set({ locksAt: game.startsAt, title })
			.where(eq(questions.id, question.id))
		updated++
	}
	return updated
}
