import DataLoader from "dataloader"
import { db } from "../db"
import type { Context } from "../graphql/context"

// Anti-copying rule: while a question is still accepting calls, you can't see
// what anyone else called until you've made your own call on it - otherwise
// you could just wait, see who's ahead, and copy them for free. Once the
// question stops accepting calls (locked/resolved/disputed), there's no more
// copying advantage to protect, so it opens up to everyone regardless of
// whether they ever called.
//
// "Can the viewer see THIS call's pick" only ever depends on the call's own
// userId (trivially - it's always visible to whoever made it) plus two facts
// about its QUESTION: whether that question is locked, and whether the
// viewer has their own call on it. Every other call on the same question
// gets the identical answer for those two facts. CallRef (question.ts) gates
// 8 separate fields behind this check, so a single call used to cost up to
// 16 queries on its own (2 per field, all computing the same thing), and a
// list of N calls spanning M distinct questions cost up to 16*N instead of a
// couple of batched queries per M. This loader batches by questionId, keyed
// per-request off the Context object itself so there's no cross-request
// bleed and no need to thread a new field through the shared Context type.
const loadersByContext = new WeakMap<Context, DataLoader<string, boolean>>()

function getPickVisibilityLoader(ctx: Context, viewerId: string) {
	let loader = loadersByContext.get(ctx)
	if (!loader) {
		loader = new DataLoader<string, boolean>(async (questionIds) => {
			const ids = [...questionIds]
			const [lockableQuestions, viewerCalls] = await Promise.all([
				db.query.questions.findMany({
					where: { id: { in: ids } },
					columns: { id: true, status: true, locksAt: true },
				}),
				db.query.calls.findMany({
					where: { questionId: { in: ids }, userId: viewerId },
					columns: { questionId: true },
				}),
			])
			const now = new Date()
			const lockedById = new Map(
				lockableQuestions.map((q) => [
					q.id,
					q.status !== "open" || q.locksAt <= now,
				]),
			)
			const viewerCalledIds = new Set(viewerCalls.map((c) => c.questionId))
			return ids.map(
				(id) => lockedById.get(id) === true || viewerCalledIds.has(id),
			)
		})
		loadersByContext.set(ctx, loader)
	}
	return loader
}

export async function canViewerSeePick(
	call: { userId: string; questionId: string },
	ctx: Context,
): Promise<boolean> {
	if (!ctx.user) return false
	if (call.userId === ctx.user.id) return true
	return getPickVisibilityLoader(ctx, ctx.user.id).load(call.questionId)
}
