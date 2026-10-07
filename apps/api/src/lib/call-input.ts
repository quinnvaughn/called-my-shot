import type { CastCallInput } from "@called-my-shot/schemas"
import { db } from "../db"
import type { Question } from "../db/schema"
import type { DbOrTx } from "../db/types"
import { ValidationError } from "./errors"

// Everything a set of picks has to satisfy to be a legal call on this
// question, beyond what the zod schema can see on its own - both rules
// need the question row, which the schema never has.
//
// Shared by castCall and redoCall rather than living in either. A redo
// replaces a call's picks wholesale, so it has to enforce exactly what the
// original insert did; two copies of "how many picks does an award need"
// drifting apart would let a redo write a call that castCall would have
// refused.
export async function validateCallInput(
	question: Pick<Question, "id" | "shape" | "picksRequired">,
	data: CastCallInput,
	executor: DbOrTx = db,
): Promise<void> {
	if (
		(data.shape === "player_season_award" ||
			data.shape === "team_season_award") &&
		data.selections.length !== question.picksRequired
	) {
		throw ValidationError.field(
			"selections",
			`Pick exactly ${question.picksRequired} - you picked ${data.selections.length}`,
		)
	}

	if (data.selections.length > 0) {
		const options = await executor.query.questionOptions.findMany({
			where: { questionId: question.id },
			columns: { id: true },
		})
		const validIds = new Set(options.map((o) => o.id))
		if (!data.selections.every((s) => validIds.has(s.optionId))) {
			throw ValidationError.field(
				"selections",
				"One or more options don't belong to this question",
			)
		}
	}
}
