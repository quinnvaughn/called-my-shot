import { and, eq, notExists, sql } from "drizzle-orm"
import { calls, questionOptions } from "../../db/schema"
import type { Tx } from "../../db/types"

// An option's price as stored: all three set on a priced side, all null on an
// unpriced one.
export type OptionPrice = {
	winMult: number | null
	lossRate: number | null
	modelHitRate: number | null
}

const UNPRICED: OptionPrice = { winMult: null, lossRate: null, modelHitRate: null }

// Moves each option to its new price (null takes its price off), only while
// nobody has called the question: the check and the write are one statement,
// so a call landing mid-run either sees the old price or keeps it. A price is
// what a caller agrees to, so once anyone has, it never moves.
export async function repriceUncalled(
	tx: Tx,
	questionId: string,
	updates: { option: { id: string } & OptionPrice; next: OptionPrice | null }[],
): Promise<void> {
	for (const { option, next } of updates) {
		const price = next ?? UNPRICED
		if (
			option.winMult === price.winMult &&
			option.lossRate === price.lossRate &&
			option.modelHitRate === price.modelHitRate
		) {
			continue
		}
		await tx
			.update(questionOptions)
			.set(price)
			.where(
				and(
					eq(questionOptions.id, option.id),
					notExists(
						tx
							.select({ one: sql`1` })
							.from(calls)
							.where(eq(calls.questionId, questionId)),
					),
				),
			)
	}
}
