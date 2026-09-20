import { isOverUnderShape } from "@called-my-shot/scoring"
import { eq } from "drizzle-orm"
import { match, P } from "ts-pattern"
import { db } from "../src/db"
import { questionOptions, questions } from "../src/db/schema"

// Fills in questions.numeric_actual_value and question_options.actual_value on
// questions the ESPN resolvers settled before either column carried a number.
// No ESPN requests: question_auto_resolutions.evidence already holds the exact
// values each decision was made from (see the Decision type in
// lib/auto-resolve/decide.ts), which is the same number the resolvers now
// persist.
//
//   pnpm --filter api backfill:actual-values            # dry run
//   pnpm --filter api backfill:actual-values -- --commit
//
// Idempotent: a question that already has its numbers is skipped.
//
// What each shape's evidence holds:
//   over/under    { value }  the subject's stat, straight onto the question
//   head-to-head  { a, b }   the two sides, in an order the evidence doesn't
//                            name - but a tie voids the question, so the
//                            higher number is the winning option's by
//                            definition and the lower is the other's
//   leader        { max }    the leading total, which belongs to whichever
//                            options were marked correct. The rest of the pool
//                            isn't in the evidence and stays null.
const HEAD_TO_HEAD_SHAPES = new Set([
	"player_vs_player",
	"player_vs_player_season",
	"team_vs_team",
	"team_vs_team_season",
])
const LEADER_SHAPES = new Set([
	"player_game_stat_leader",
	"player_season_stat_leader",
])

type Write =
	| { table: "question"; questionId: string; value: number }
	| { table: "option"; optionId: string; value: number }

const numberAt = (
	evidence: Record<string, unknown> | null,
	key: string,
): number | null => {
	const value = evidence?.[key]
	return typeof value === "number" && Number.isFinite(value) ? value : null
}

const commit = process.argv.includes("--commit")

const candidates = await db.query.questions.findMany({
	where: {
		resolutionMethod: "system",
		status: { in: ["resolved", "disputed"] },
	},
	columns: { id: true, shape: true, numericActualValue: true },
	with: {
		options: { columns: { id: true, isCorrect: true, actualValue: true } },
		autoResolution: { columns: { evidence: true } },
	},
})

const writes: Write[] = []
let skipped = 0

for (const question of candidates) {
	const evidence = question.autoResolution?.evidence ?? null
	if (!evidence) {
		skipped++
		continue
	}

	const planned = match(question.shape)
		.returnType<Write[]>()
		.when(isOverUnderShape, () => {
			const value = numberAt(evidence, "value")
			return value === null || question.numericActualValue !== null
				? []
				: [{ table: "question", questionId: question.id, value } as const]
		})
		.when(
			(shape) => HEAD_TO_HEAD_SHAPES.has(shape),
			() => {
				const a = numberAt(evidence, "a")
				const b = numberAt(evidence, "b")
				const winner = question.options.find((o) => o.isCorrect)
				const loser = question.options.find((o) => o.id !== winner?.id)
				if (
					a === null ||
					b === null ||
					question.options.length !== 2 ||
					!winner ||
					!loser ||
					winner.actualValue !== null
				) {
					return []
				}
				return [
					{
						table: "option",
						optionId: winner.id,
						value: Math.max(a, b),
					} as const,
					{
						table: "option",
						optionId: loser.id,
						value: Math.min(a, b),
					} as const,
				]
			},
		)
		.when(
			(shape) => LEADER_SHAPES.has(shape),
			() => {
				const max = numberAt(evidence, "max")
				if (max === null) return []
				return question.options
					.filter((o) => o.isCorrect && o.actualValue === null)
					.map(
						(o) =>
							({ table: "option", optionId: o.id, value: max }) as const,
					)
			},
		)
		.with(P._, () => [])
		.exhaustive()

	if (planned.length === 0) skipped++
	writes.push(...planned)
}

const questionWrites = writes.filter((w) => w.table === "question").length
const optionWrites = writes.length - questionWrites

if (writes.length === 0) {
	console.log(
		`Nothing to backfill. ${candidates.length} system-resolved question(s) checked.`,
	)
	process.exit(0)
}

if (!commit) {
	console.log(
		`${questionWrites} question value(s) and ${optionWrites} option value(s) to write across ${candidates.length - skipped} question(s). Re-run with --commit.`,
	)
	process.exit(0)
}

await db.transaction(async (tx) => {
	for (const write of writes) {
		if (write.table === "question") {
			await tx
				.update(questions)
				.set({ numericActualValue: write.value })
				.where(eq(questions.id, write.questionId))
		} else {
			await tx
				.update(questionOptions)
				.set({ actualValue: write.value })
				.where(eq(questionOptions.id, write.optionId))
		}
	}
})

console.log(
	`Wrote ${questionWrites} question value(s) and ${optionWrites} option value(s).`,
)
process.exit(0)
