import { eq } from "drizzle-orm"
import type { db } from "../../db"
import { questions } from "../../db/schema"
import { type GameForTitle, gameQuestionTitle, titleFactsFor } from "./titles"

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

// Every generated question on a game locks when the game starts, so when ESPN
// moves a game (a flex, a rain delay reschedule) its lock time follows it. The
// same pass rebuilds each title from the current template, which keeps an
// open question's wording in step with the template. Only open and locked
// questions change: a resolved or disputed one already has a real-world
// result attached, so a late correction shouldn't change what it says.
// Returns how many questions changed.
export async function refreshGeneratedQuestionSchedule(
	tx: Tx,
	game: GameForTitle & { id: string; startsAt: Date },
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
