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
// That rule is advisory rather than airtight, on purpose. Query.call reads a
// call by id (see markCallPubliclyAddressed below), Call.id is ungated, and
// pagination cursors carry a plaintext id (lib/pagination.ts), so an open
// question's call ids are harvestable and their picks readable by anyone who
// bothers. The alternative was masking the id every list on the client keys
// off, which costs more than the rule is worth - especially with calls headed
// toward being open by default.
//
// "Can the viewer see THIS call's pick" otherwise depends on the call's own
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

// Calls whose id the client supplied directly, via Query.call. Possession of
// the id is the authorization there: the call page (/calls/:id) is the
// permanent public record of one call, and it has to render for someone
// arriving from a link with no account at all. Per-request, same
// WeakMap-on-Context reasoning as the loader above. Deliberately scoped to
// the exact id asked for - siblings reached through call.question.calls stay
// gated normally.
const directCallIdsByContext = new WeakMap<Context, Set<string>>()

export function markCallPubliclyAddressed(ctx: Context, callId: string): void {
	let ids = directCallIdsByContext.get(ctx)
	if (!ids) {
		ids = new Set()
		directCallIdsByContext.set(ctx, ids)
	}
	ids.add(callId)
}

function getPickVisibilityLoader(ctx: Context, viewerId: string | null) {
	let loader = loadersByContext.get(ctx)
	if (!loader) {
		loader = new DataLoader<string, boolean>(async (questionIds) => {
			const ids = [...questionIds]
			const [lockableQuestions, viewerCalls] = await Promise.all([
				db.query.questions.findMany({
					where: { id: { in: ids } },
					columns: { id: true, status: true, locksAt: true },
				}),
				// Signed out there is no "I already called, so show me" exemption
				// to look up, so the query is skipped rather than run with
				// `userId: undefined`. Drizzle's relational query builder DROPS an
				// undefined filter instead of matching nothing, which would return
				// every call on these questions and mark all of them viewer-called -
				// handing an anonymous viewer exactly the open-question picks this
				// file exists to withhold.
				viewerId
					? db.query.calls.findMany({
							where: { questionId: { in: ids }, userId: viewerId },
							columns: { questionId: true },
						})
					: Promise.resolve<{ questionId: string }[]>([]),
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
	call: { id: string; userId: string; questionId: string },
	ctx: Context,
): Promise<boolean> {
	// There is deliberately no `if (!ctx.user) return false` here any more.
	// Once a question stops accepting calls there is no copying advantage left
	// to protect, and that is as true signed out as signed in - the early
	// return meant a shared link to a resolved call previewed as a wall of
	// "make your call to reveal" to everyone without an account, which is most
	// of the audience a shared link has.
	if (ctx.user && call.userId === ctx.user.id) return true
	if (directCallIdsByContext.get(ctx)?.has(call.id)) return true
	return getPickVisibilityLoader(ctx, ctx.user?.id ?? null).load(
		call.questionId,
	)
}
