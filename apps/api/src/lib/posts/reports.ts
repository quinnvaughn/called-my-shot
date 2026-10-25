import { type ReportPostInput, reportPostSchema } from "@called-my-shot/schemas"
import { and, eq, inArray, isNull } from "drizzle-orm"
import { db } from "../../db"
import {
	type PostReport,
	postReports,
	posts,
	prompts,
	type User,
} from "../../db/schema"
import type { Tx } from "../../db/types"
import { enqueueAnalyticsEvents } from "../analytics-outbox"
import { NotFoundError, ValidationError } from "../errors"
import { loadVisiblePost } from "./visibility"

// Anyone who can see a post can report it, once. Reports wait for an admin,
// who can take down the post or, when the problem is the prompt's title, the
// prompt and every answer to it. Nothing comes down on its own.
export async function reportPost(
	reporter: User,
	input: ReportPostInput,
): Promise<PostReport> {
	const parsed = reportPostSchema.safeParse(input)
	if (!parsed.success) throw ValidationError.fromZodIssues(parsed.error.issues)
	const loaded = await loadVisiblePost(db, reporter.id, parsed.data.postId)
	if (!loaded) throw new NotFoundError("Post not found")
	if (loaded.post.authorId === reporter.id) {
		throw ValidationError.field(null, "You can't report your own post.")
	}
	return db.transaction(async (tx) => {
		const [row] = await tx
			.insert(postReports)
			.values({
				reporterId: reporter.id,
				postId: loaded.post.id,
				reason: parsed.data.reason,
				details: parsed.data.details || null,
			})
			.onConflictDoNothing()
			.returning()
		if (!row) throw ValidationError.field(null, "You've already reported this.")
		await enqueueAnalyticsEvents(tx, [
			{
				event: "post_reported",
				userId: reporter.id,
				properties: { postId: loaded.post.id, reason: parsed.data.reason },
			},
		])
		return row
	})
}

export async function dismissPostReport(
	admin: User,
	reportId: string,
	now = new Date(),
): Promise<PostReport> {
	const [report] = await db
		.update(postReports)
		.set({ status: "dismissed", reviewedAt: now, reviewedByAdminId: admin.id })
		.where(and(eq(postReports.id, reportId), eq(postReports.status, "open")))
		.returning()
	if (!report) throw new NotFoundError("Report not found")
	return report
}

async function closeReports(
	tx: Tx,
	postIds: string[],
	admin: User,
	now: Date,
): Promise<void> {
	if (postIds.length === 0) return
	await tx
		.update(postReports)
		.set({ status: "removed", reviewedAt: now, reviewedByAdminId: admin.id })
		.where(
			and(inArray(postReports.postId, postIds), eq(postReports.status, "open")),
		)
}

async function reportOrThrow(tx: Tx, reportId: string): Promise<PostReport> {
	const report = await tx.query.postReports.findFirst({
		where: { id: reportId },
	})
	if (!report) throw new NotFoundError("Report not found")
	return report
}

// Takes the reported post down and closes every open report on it. Its
// content stays on the row for the report's record.
export async function removePost(
	admin: User,
	reportId: string,
	now = new Date(),
): Promise<PostReport> {
	return db.transaction(async (tx) => {
		const report = await reportOrThrow(tx, reportId)
		await tx
			.update(posts)
			.set({ removedAt: now })
			.where(and(eq(posts.id, report.postId), isNull(posts.removedAt)))
		await closeReports(tx, [report.postId], admin, now)
		return reportOrThrow(tx, reportId)
	})
}

// Takes down the prompt the reported post answers, and with it every answer
// (none of them shows once their prompt is gone). Closes the open reports on
// all of those answers, since there's nothing left to review.
export async function removePrompt(
	admin: User,
	reportId: string,
	now = new Date(),
): Promise<PostReport> {
	return db.transaction(async (tx) => {
		const report = await reportOrThrow(tx, reportId)
		const post = await tx.query.posts.findFirst({
			where: { id: report.postId },
			columns: { promptId: true },
		})
		if (!post) throw new NotFoundError("Post not found")
		await tx
			.update(prompts)
			.set({ removedAt: now })
			.where(and(eq(prompts.id, post.promptId), isNull(prompts.removedAt)))
		const answers = await tx
			.select({ id: posts.id })
			.from(posts)
			.where(eq(posts.promptId, post.promptId))
		await closeReports(
			tx,
			answers.map((answer) => answer.id),
			admin,
			now,
		)
		return reportOrThrow(tx, reportId)
	})
}
