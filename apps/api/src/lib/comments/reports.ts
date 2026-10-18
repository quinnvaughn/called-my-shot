import {
	type ReportCommentInput,
	reportCommentSchema,
} from "@called-my-shot/schemas"
import { and, eq, isNull } from "drizzle-orm"
import { db } from "../../db"
import {
	type CommentReport,
	commentReports,
	comments,
	type User,
} from "../../db/schema"
import { enqueueAnalyticsEvents } from "../analytics-outbox"
import { NotFoundError, ValidationError } from "../errors"
import { reportGifToKlipy } from "../gifs/klipy"

// Anyone signed in can report a comment, once. Reports wait for an admin;
// nothing comes down on its own.
export async function reportComment(
	reporter: User,
	input: ReportCommentInput,
): Promise<CommentReport> {
	const parsed = reportCommentSchema.safeParse(input)
	if (!parsed.success) throw ValidationError.fromZodIssues(parsed.error.issues)
	const comment = await db.query.comments.findFirst({
		where: { id: parsed.data.commentId },
	})
	if (!comment || comment.removedAt)
		throw new NotFoundError("Comment not found")
	if (comment.senderId === reporter.id) {
		throw ValidationError.field(null, "You can't report your own comment.")
	}

	const report = await db.transaction(async (tx) => {
		const [row] = await tx
			.insert(commentReports)
			.values({
				reporterId: reporter.id,
				commentId: comment.id,
				reason: parsed.data.reason,
				details: parsed.data.details || null,
			})
			.onConflictDoNothing()
			.returning()
		if (!row) throw ValidationError.field(null, "You've already reported this.")
		await enqueueAnalyticsEvents(tx, [
			{
				event: "comment_reported",
				userId: reporter.id,
				properties: { commentId: comment.id, reason: parsed.data.reason },
			},
		])
		return row
	})
	if (comment.gifId)
		reportGifToKlipy(comment.gifId, reporter.id, parsed.data.reason)
	return report
}

export async function dismissCommentReport(
	admin: User,
	reportId: string,
	now = new Date(),
): Promise<CommentReport> {
	const [report] = await db
		.update(commentReports)
		.set({ status: "dismissed", reviewedAt: now, reviewedByAdminId: admin.id })
		.where(
			and(eq(commentReports.id, reportId), eq(commentReports.status, "open")),
		)
		.returning()
	if (!report) throw new NotFoundError("Report not found")
	return report
}

// Takes the reported comment down, closing every open report on it. The
// content stays on the row for the report's record.
export async function removeComment(
	admin: User,
	reportId: string,
	now = new Date(),
): Promise<CommentReport> {
	return db.transaction(async (tx) => {
		const report = await tx.query.commentReports.findFirst({
			where: { id: reportId },
		})
		if (!report) throw new NotFoundError("Report not found")
		await tx
			.update(comments)
			.set({ removedAt: now })
			.where(and(eq(comments.id, report.commentId), isNull(comments.removedAt)))
		await tx
			.update(commentReports)
			.set({ status: "removed", reviewedAt: now, reviewedByAdminId: admin.id })
			.where(
				and(
					eq(commentReports.commentId, report.commentId),
					eq(commentReports.status, "open"),
				),
			)
		const updated = await tx.query.commentReports.findFirst({
			where: { id: reportId },
		})
		if (!updated) throw new NotFoundError("Report not found")
		return updated
	})
}
