import type {
	AnswerPresserQuestionInput,
	AskPresserQuestionInput,
	PostPresserStatementInput,
	ReportPresserContentInput,
} from "@called-my-shot/schemas"
import { and, eq, gt, inArray, isNull, or } from "drizzle-orm"
import { db } from "../../db"
import {
	type Presser,
	type PresserReport,
	presserQuestions,
	presserReports,
	pressers,
	type User,
	userBlocks,
	users,
} from "../../db/schema"
import type { Tx } from "../../db/types"
import { enqueueAnalyticsEvents } from "../analytics-outbox"
import { AuthorizationError, NotFoundError, ValidationError } from "../errors"
import { categoryMessage, moderateText, type Strictness } from "../moderation"
import { createNotification } from "../notifications"
import { isPresserOpen } from "./app-questions"
import { askEligibility, type PresserAskStatus } from "./ask"
import { SORT_RANK } from "./constants"
import { canSeeQuestion, visibleStatement } from "./visibility"

async function lockPresser(tx: Tx, presserId: string): Promise<Presser> {
	const [presser] = await tx
		.select()
		.from(pressers)
		.where(eq(pressers.id, presserId))
		.for("update")
	if (!presser) throw new NotFoundError("Presser not found")
	return presser
}

const minutesBetween = (from: Date, to: Date) =>
	Math.max(0, Math.round((to.getTime() - from.getTime()) / 60_000))

// The moderation check, with whatever it turns away recorded (without the
// text) so a filter that's too eager shows up in the numbers.
async function assertAllowedText(
	user: User,
	text: string,
	field: { input: string; event: "statement" | "question" | "answer" },
	strictness: Strictness,
): Promise<void> {
	const result = await moderateText(text, { strictness })
	if (result.ok) return
	await db.transaction((tx) =>
		enqueueAnalyticsEvents(tx, [
			{
				event: "presser_text_blocked",
				userId: user.id,
				properties: {
					field: field.event,
					category: result.category,
					strictness,
				},
			},
		]),
	)
	throw ValidationError.field(field.input, categoryMessage(result.category))
}

const ASK_REFUSAL: Record<Exclude<PresserAskStatus, "can_ask">, string> = {
	signed_out: "Sign in to ask a question.",
	own_presser: "You can't ask yourself a question.",
	closed: "This presser is closed.",
	already_asked: "You've already asked your question here.",
	blocked: "You can't ask this person a question.",
	not_eligible:
		"Only people in a group with them, or who called this game, can ask.",
	new_account: "Your account is too new to ask people outside your groups.",
	stranger_cap_reached:
		"This presser has taken all the questions it can from outside their groups.",
}

export async function postPresserStatement(
	user: User,
	input: PostPresserStatementInput,
	now = new Date(),
): Promise<Presser> {
	await assertAllowedText(
		user,
		input.text,
		{ input: "text", event: "statement" },
		"standard",
	)
	return db.transaction(async (tx) => {
		const presser = await lockPresser(tx, input.presserId)
		if (presser.userId !== user.id) {
			throw new AuthorizationError("Only the owner can post a statement.")
		}
		if (!isPresserOpen(presser, now)) {
			throw ValidationError.field(null, "This presser is closed.")
		}
		if (presser.statementPostedAt) {
			throw ValidationError.field(null, "Your statement is already posted.")
		}
		const [updated] = await tx
			.update(pressers)
			.set({ statementText: input.text, statementPostedAt: now })
			.where(eq(pressers.id, presser.id))
			.returning()
		await enqueueAnalyticsEvents(tx, [
			{
				event: "presser_statement_posted",
				userId: user.id,
				properties: {
					presserId: presser.id,
					minutesSinceOpen: minutesBetween(presser.openedAt, now),
				},
			},
		])
		return updated ?? presser
	})
}

export async function askPresserQuestion(
	user: User,
	input: AskPresserQuestionInput,
	now = new Date(),
): Promise<Presser> {
	const presser = await db.query.pressers.findFirst({
		where: { id: input.presserId },
	})
	if (!presser) throw new NotFoundError("Presser not found")

	// Read once before the network-bound check below picks its strictness,
	// then again under the lock, where it decides.
	const first = await askEligibility(db, user, presser, now)
	if (first.status !== "can_ask") {
		throw ValidationError.field(null, ASK_REFUSAL[first.status])
	}
	await assertAllowedText(
		user,
		input.body,
		{ input: "body", event: "question" },
		first.source === "group" ? "standard" : "strict",
	)

	return db.transaction(async (tx) => {
		const locked = await lockPresser(tx, presser.id)
		const eligibility = await askEligibility(tx, user, locked, now)
		if (eligibility.status !== "can_ask") {
			throw ValidationError.field(null, ASK_REFUSAL[eligibility.status])
		}
		await tx.insert(presserQuestions).values({
			presserId: locked.id,
			source: eligibility.source,
			askerId: user.id,
			body: input.body,
			sortRank: eligibility.sortRank,
			createdAt: now,
		})
		await createNotification(tx, {
			type: "presser_question_received",
			userId: locked.userId,
			presserId: locked.id,
			gameId: locked.gameId,
			actorId: user.id,
			actorUsername: user.username,
		})
		await enqueueAnalyticsEvents(tx, [
			{
				event: "presser_question_asked",
				userId: user.id,
				properties: {
					presserId: locked.id,
					gameId: locked.gameId,
					source: eligibility.source,
					askerFadedOwner: eligibility.sortRank === SORT_RANK.fader,
				},
			},
		])
		return locked
	})
}

export async function answerPresserQuestion(
	user: User,
	input: AnswerPresserQuestionInput,
	now = new Date(),
): Promise<Presser> {
	if (!input.noComment) {
		await assertAllowedText(
			user,
			input.answer,
			{ input: "answer", event: "answer" },
			"standard",
		)
	}
	return db.transaction(async (tx) => {
		const question = await tx.query.presserQuestions.findFirst({
			where: { id: input.questionId },
		})
		if (!question) throw new NotFoundError("Question not found")
		const presser = await lockPresser(tx, question.presserId)
		if (presser.userId !== user.id) {
			throw new AuthorizationError("Only the owner can answer.")
		}
		if (!isPresserOpen(presser, now)) {
			throw ValidationError.field(null, "This presser is closed.")
		}
		const [answered] = await tx
			.update(presserQuestions)
			.set({
				status: "answered",
				answerText: input.noComment ? null : input.answer,
				noComment: input.noComment,
				answeredAt: now,
			})
			.where(
				and(
					eq(presserQuestions.id, question.id),
					eq(presserQuestions.status, "pending"),
				),
			)
			.returning({ id: presserQuestions.id })
		if (!answered) {
			throw ValidationError.field(null, "That question can't be answered.")
		}
		await enqueueAnalyticsEvents(tx, [
			{
				event: "presser_question_answered",
				userId: user.id,
				properties: {
					presserId: presser.id,
					source: question.source,
					noComment: input.noComment,
					minutesToAnswer: minutesBetween(question.createdAt, now),
				},
			},
		])
		if (question.askerId) {
			await createNotification(tx, {
				type: "presser_answered",
				userId: question.askerId,
				presserId: presser.id,
				gameId: presser.gameId,
				actorId: user.id,
				actorUsername: user.username,
			})
		}
		return presser
	})
}

// Anyone signed in can report what they can see. The owner can also report a
// question still waiting on them, which only they and its asker can see.
export async function reportPresserContent(
	user: User,
	input: ReportPresserContentInput,
	now = new Date(),
): Promise<PresserReport> {
	const presser = await db.query.pressers.findFirst({
		where: { id: input.presserId },
	})
	if (!presser) throw new NotFoundError("Presser not found")

	if (input.target === "statement") {
		if (!visibleStatement(presser)) throw new NotFoundError("Nothing to report")
	} else {
		const question = await db.query.presserQuestions.findFirst({
			where: { id: input.presserQuestionId ?? "", presserId: presser.id },
		})
		if (!question || !canSeeQuestion(question, presser, user.id, now)) {
			throw new NotFoundError("Question not found")
		}
		if (input.target === "answer" && !question.answerText) {
			throw new NotFoundError("Nothing to report")
		}
	}

	const report = await db.transaction(async (tx) => {
		const [row] = await tx
			.insert(presserReports)
			.values({
				reporterId: user.id,
				presserId: presser.id,
				presserQuestionId:
					input.target === "statement"
						? null
						: (input.presserQuestionId ?? null),
				target: input.target,
				reason: input.reason,
				details: input.details || null,
				createdAt: now,
			})
			.onConflictDoNothing()
			.returning()
		if (!row) return null
		await enqueueAnalyticsEvents(tx, [
			{
				event: "presser_content_reported",
				userId: user.id,
				properties: {
					presserId: presser.id,
					target: input.target,
					reason: input.reason,
				},
			},
		])
		return row
	})
	if (!report) {
		throw ValidationError.field(null, "You've already reported this.")
	}
	return report
}

// Also withdraws the blocked user's pending questions on any of the
// blocker's open pressers, so blocking someone clears what they already
// asked.
export async function blockUser(
	user: User,
	username: string,
	now = new Date(),
): Promise<User> {
	const target = await db.query.users.findFirst({ where: { username } })
	if (!target) throw new NotFoundError("User not found")
	if (target.id === user.id) {
		throw ValidationError.field(null, "You can't block yourself.")
	}
	await db.transaction(async (tx) => {
		const [added] = await tx
			.insert(userBlocks)
			.values({ blockerId: user.id, blockedId: target.id })
			.onConflictDoNothing()
			.returning({ blockedId: userBlocks.blockedId })
		const open = tx
			.select({ id: pressers.id })
			.from(pressers)
			.where(and(eq(pressers.userId, user.id), gt(pressers.closesAt, now)))
		const withdrawn = await tx
			.update(presserQuestions)
			.set({ status: "withdrawn" })
			.where(
				and(
					eq(presserQuestions.askerId, target.id),
					eq(presserQuestions.status, "pending"),
					inArray(presserQuestions.presserId, open),
				),
			)
			.returning({ id: presserQuestions.id })
		if (!added) return
		await enqueueAnalyticsEvents(tx, [
			{
				event: "user_blocked",
				userId: user.id,
				properties: {
					blockedUserId: target.id,
					withdrawnQuestions: withdrawn.length,
				},
			},
		])
	})
	return target
}

export async function unblockUser(user: User, username: string): Promise<User> {
	const target = await db.query.users.findFirst({ where: { username } })
	if (!target) throw new NotFoundError("User not found")
	await db
		.delete(userBlocks)
		.where(
			and(
				eq(userBlocks.blockerId, user.id),
				eq(userBlocks.blockedId, target.id),
			),
		)
	return target
}

export async function blockedUsers(userId: string): Promise<User[]> {
	const rows = await db
		.select({ user: users })
		.from(userBlocks)
		.innerJoin(users, eq(users.id, userBlocks.blockedId))
		.where(eq(userBlocks.blockerId, userId))
		.orderBy(users.username)
	return rows.map((row) => row.user)
}

export async function dismissPresserReport(
	admin: User,
	reportId: string,
	now = new Date(),
): Promise<PresserReport> {
	const [report] = await db
		.update(presserReports)
		.set({ status: "dismissed", reviewedAt: now, reviewedByAdminId: admin.id })
		.where(
			and(eq(presserReports.id, reportId), eq(presserReports.status, "open")),
		)
		.returning()
	if (!report) throw new NotFoundError("Report not found")
	return report
}

// Takes the reported content down: a statement is hidden, and a question or
// answer takes the whole Q&A with it. Every open report on the same content
// closes with it.
export async function removePresserContent(
	admin: User,
	reportId: string,
	now = new Date(),
): Promise<PresserReport> {
	return db.transaction(async (tx) => {
		const report = await tx.query.presserReports.findFirst({
			where: { id: reportId },
		})
		if (!report) throw new NotFoundError("Report not found")

		const sameContent =
			report.presserQuestionId === null
				? and(
						eq(presserReports.presserId, report.presserId),
						eq(presserReports.target, "statement"),
					)
				: eq(presserReports.presserQuestionId, report.presserQuestionId)

		if (report.presserQuestionId === null) {
			await tx
				.update(pressers)
				.set({ statementRemovedAt: now })
				.where(
					and(
						eq(pressers.id, report.presserId),
						isNull(pressers.statementRemovedAt),
					),
				)
		} else {
			await tx
				.update(presserQuestions)
				.set({ status: "removed" })
				.where(eq(presserQuestions.id, report.presserQuestionId))
		}
		const closed = await tx
			.update(presserReports)
			.set({ status: "removed", reviewedAt: now, reviewedByAdminId: admin.id })
			.where(
				and(
					sameContent,
					or(
						eq(presserReports.status, "open"),
						eq(presserReports.id, report.id),
					),
				),
			)
			.returning()
		return closed.find((row) => row.id === report.id) ?? report
	})
}
