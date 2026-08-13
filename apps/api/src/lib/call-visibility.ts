import { db } from "../db"

// Anti-copying rule: while a question is still accepting calls, you can't see
// what anyone else called until you've made your own call on it - otherwise
// you could just wait, see who's ahead, and copy them for free. Once the
// question stops accepting calls (locked/resolved/disputed), there's no more
// copying advantage to protect, so it opens up to everyone regardless of
// whether they ever called.
export async function canViewerSeePick(
	call: { userId: string; questionId: string },
	viewerId: string | null,
): Promise<boolean> {
	if (!viewerId) return false
	if (call.userId === viewerId) return true

	const question = await db.query.questions.findFirst({
		where: { id: call.questionId },
		columns: { status: true },
	})
	if (question && question.status !== "open") return true

	const viewerCall = await db.query.calls.findFirst({
		where: { questionId: call.questionId, userId: viewerId },
		columns: { id: true },
	})
	return !!viewerCall
}
