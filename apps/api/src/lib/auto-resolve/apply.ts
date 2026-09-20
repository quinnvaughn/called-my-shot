import { eq } from "drizzle-orm"
import { match } from "ts-pattern"
import { db } from "../../db/index"
import {
	type Question,
	type QuestionAutoResolution,
	questionAutoResolutions,
	questions,
	type QuestionVoidedReason,
} from "../../db/schema"
import { roundToThousandths } from "../../db/sync/box-score-parse"
import { resolveQuestionInternal } from "../resolve-question"
import type { Tx } from "../user-season-stats"
import { markQuestionVoided } from "../void-question"
import type { Decision } from "./decide"

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS

// ESPN corrects its numbers after the fact, so a question settled from them is
// read once more this long after.
export const RECHECK_DELAY_MS = 24 * HOUR_MS
const FIRST_RETRY_MS = 10 * MINUTE_MS
const MAX_RETRY_MS = 2 * HOUR_MS

export type ApplyContext = {
	now: Date
	// When a failure that could still clear stops being retried and goes to an
	// admin.
	escalateAt: Date
	resolutionSource: string
	// Null when the question couldn't be matched to an ESPN page.
	resolutionSourceUrl: string | null
	resolvedNote: string
	// The note is picked from the reason the question was voided, so a tie or a
	// missing leader isn't reported as a player who didn't play.
	voidedNote: (reason: QuestionVoidedReason) => string
}

// Builds that note for a resolver reading one ESPN page, named by source.
export function autoVoidedNote(
	source: string,
): (reason: QuestionVoidedReason) => string {
	return (reason) =>
		match(reason)
			.returnType<string>()
			.with(
				"subject_did_not_play",
				() => `Voided automatically from ${source}: the player didn't play.`,
			)
			.with(
				"game_not_completed",
				() => `Voided automatically from ${source}: the game wasn't completed.`,
			)
			.with(
				"tie",
				() =>
					`Voided automatically from ${source}: both sides finished level, so neither one is ahead.`,
			)
			.with(
				"no_leader",
				() => `Voided automatically from ${source}: nobody recorded this stat.`,
			)
			.with("other", () => `Voided automatically from ${source}.`)
			.exhaustive()
}

type AutoResolutionPatch = Partial<
	Omit<typeof questionAutoResolutions.$inferInsert, "questionId">
>

// A question backing off after a failure waits for its next attempt, and one
// already handed to an admin waits for them. The re-check of a result that was
// posted goes ahead either way.
export function isAttemptDue(
	question: Pick<Question, "status"> & {
		autoResolution: QuestionAutoResolution | null
	},
	now: Date,
): boolean {
	const auto = question.autoResolution
	if (auto?.nextAttemptAt && auto.nextAttemptAt > now) return false
	return question.status === "resolved" || question.status === "voided"
		? true
		: !auto?.escalatedAt
}

// Re-reads the question under a row lock before acting, so a resolution an
// admin made while ESPN was being read is never overwritten.
export async function applyDecision(
	questionId: string,
	decision: Decision,
	ctx: ApplyContext,
): Promise<void> {
	await db.transaction(async (tx) => {
		const [question] = await tx
			.select()
			.from(questions)
			.where(eq(questions.id, questionId))
			.for("update")
		if (question?.resolutionMode !== "system") return
		const auto = await tx.query.questionAutoResolutions.findFirst({
			where: { questionId },
		})

		const patch = await match(question.status)
			.returnType<Promise<AutoResolutionPatch | null>>()
			.with("open", "locked", () =>
				firstPass(tx, question, decision, auto ?? null, ctx),
			)
			.with("resolved", "voided", () =>
				recheck(tx, question, decision, auto ?? null, ctx),
			)
			.with("disputed", async () => null)
			.exhaustive()
		if (!patch) return

		await tx
			.insert(questionAutoResolutions)
			.values({ questionId, ...patch })
			.onConflictDoUpdate({
				target: questionAutoResolutions.questionId,
				set: patch,
			})
	})
}

const retryDelayMs = (attempts: number) =>
	Math.min(FIRST_RETRY_MS * 2 ** (attempts - 1), MAX_RETRY_MS)

async function settleFrom(
	tx: Tx,
	question: Question,
	decision: Exclude<Decision, { kind: "fail" }>,
	ctx: ApplyContext,
): Promise<void> {
	await match(decision)
		.with({ kind: "resolve" }, (d) =>
			resolveQuestionInternal(
				tx,
				question,
				{
					correctOptionIds: d.correctOptionIds,
					actualValue: d.actualValue,
					resolutionNote: ctx.resolvedNote,
				},
				{
					resolvedBy: { method: "system" },
					source: {
						resolutionSource: ctx.resolutionSource,
						...(ctx.resolutionSourceUrl
							? { resolutionSourceUrl: ctx.resolutionSourceUrl }
							: {}),
					},
				},
			),
		)
		.with({ kind: "void" }, (d) =>
			markQuestionVoided(tx, question, {
				reason: d.reason,
				note: ctx.voidedNote(d.reason),
				voidedBy: { method: "system" },
			}),
		)
		.exhaustive()
}

async function firstPass(
	tx: Tx,
	question: Question,
	decision: Decision,
	auto: QuestionAutoResolution | null,
	ctx: ApplyContext,
): Promise<AutoResolutionPatch> {
	const attempts = (auto?.attempts ?? 0) + 1
	const attempted = { attempts, lastAttemptAt: ctx.now }

	if (decision.kind === "fail") {
		const escalate = !decision.retryable || ctx.now >= ctx.escalateAt
		return {
			...attempted,
			failureReason: decision.reason,
			failureDetail: decision.detail,
			nextAttemptAt: escalate
				? null
				: new Date(ctx.now.getTime() + retryDelayMs(attempts)),
			escalatedAt: escalate ? ctx.now : null,
		}
	}

	await settleFrom(tx, question, decision, ctx)
	return {
		...attempted,
		settledAt: ctx.now,
		recheckDueAt: new Date(ctx.now.getTime() + RECHECK_DELAY_MS),
		nextAttemptAt: null,
		failureReason: null,
		failureDetail: null,
		evidence: decision.kind === "resolve" ? decision.evidence : {},
	}
}

// The one re-read of a question the resolver already settled. Only a changed
// result moves anything; a read that can't settle leaves the posted result
// alone and flags it for an admin.
async function recheck(
	tx: Tx,
	question: Question,
	decision: Decision,
	auto: QuestionAutoResolution | null,
	ctx: ApplyContext,
): Promise<AutoResolutionPatch | null> {
	const recheckDueAt = auto?.recheckDueAt
	// Checked again under the row lock: a run that loaded this question while it
	// was still open reaches here after another run settled it, and must not
	// spend the re-check early.
	if (
		question.resolutionMethod !== "system" ||
		!recheckDueAt ||
		recheckDueAt > ctx.now ||
		auto.recheckedAt
	) {
		return null
	}
	const done = { lastAttemptAt: ctx.now, recheckedAt: ctx.now }

	// A dispute means a person has weighed in on this result, so a second
	// automatic read doesn't get to change it.
	const dispute = await tx.query.resolutionDisputes.findFirst({
		where: { questionId: question.id },
	})
	if (dispute) return done

	if (decision.kind === "fail") {
		const giveUpAt = recheckDueAt.getTime() + RECHECK_DELAY_MS
		if (decision.retryable && ctx.now.getTime() < giveUpAt) {
			return {
				lastAttemptAt: ctx.now,
				nextAttemptAt: new Date(ctx.now.getTime() + FIRST_RETRY_MS),
			}
		}
		return decision.retryable
			? done
			: {
					...done,
					failureReason: "recheck_disagreed",
					failureDetail: `${decision.reason}: ${decision.detail}`,
					escalatedAt: ctx.now,
				}
	}

	if (!(await hasSameResult(tx, question, decision))) {
		await settleFrom(tx, question, decision, ctx)
	}
	return {
		...done,
		evidence: decision.kind === "resolve" ? decision.evidence : {},
	}
}

async function hasSameResult(
	tx: Tx,
	question: Question,
	decision: Exclude<Decision, { kind: "fail" }>,
): Promise<boolean> {
	if (decision.kind === "void") return question.status === "voided"
	if (question.status !== "resolved") return false
	if (decision.actualValue !== undefined) {
		return (
			question.numericActualValue !== null &&
			roundToThousandths(question.numericActualValue) ===
				roundToThousandths(decision.actualValue)
		)
	}
	const options = await tx.query.questionOptions.findMany({
		where: { questionId: question.id },
		columns: { id: true, isCorrect: true },
	})
	const current = new Set(options.filter((o) => o.isCorrect).map((o) => o.id))
	return (
		current.size === decision.correctOptionIds.length &&
		decision.correctOptionIds.every((id) => current.has(id))
	)
}
