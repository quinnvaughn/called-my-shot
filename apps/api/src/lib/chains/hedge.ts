import { and, asc, eq, inArray, ne } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { callSelections, calls, chainLinks, chains } from "../../db/schema"
import type { DbOrTx, Tx } from "../../db/types"
import { ValidationError } from "../errors"
import { type LoadedLink, loadChainLinks } from "./load"
import { chainPhase } from "./state"

// Nobody in a chain may hold the other side of another member's link: they'd
// be rooting for their own chain to break, and win either way. Checked from
// both ends - when someone joins, against every link already in, and when
// anyone calls, against every chain they're in - for as long as the chain
// can still be decided by it.

const stillDeciding = (phase: ReturnType<typeof chainPhase>) =>
	phase === "open" || phase === "live"

// The option each link in a chain picked, by question.
const pickedByQuestion = (links: LoadedLink[]) =>
	new Map(
		links.flatMap((link) =>
			link.pick
				? [[link.questionId, { link, optionId: link.pick.optionId }]]
				: [],
		),
	)

// Whether `userId` already holds the other side of any of `links`, read off
// their calls on those questions. Their own link is skipped.
export async function hedgeAgainstLinks(
	tx: DbOrTx,
	userId: string,
	links: LoadedLink[],
): Promise<LoadedLink | null> {
	const others = links.filter((link) => link.userId !== userId)
	if (others.length === 0) return null
	const picked = pickedByQuestion(others)
	const held = await tx
		.select({ questionId: calls.questionId, optionId: callSelections.optionId })
		.from(calls)
		.innerJoin(callSelections, eq(callSelections.callId, calls.id))
		.where(
			and(
				eq(calls.userId, userId),
				inArray(calls.questionId, [...picked.keys()]),
			),
		)
	for (const row of held) {
		const link = picked.get(row.questionId)
		if (link && link.optionId !== row.optionId) return link.link
	}
	return null
}

// Whether anyone in `members` holds the other side of a new link's pick.
export async function hedgeAgainstPick(
	tx: DbOrTx,
	members: string[],
	pick: { userId: string; questionId: string; optionId: string },
): Promise<string | null> {
	const others = members.filter((id) => id !== pick.userId)
	if (others.length === 0) return null
	const [row] = await tx
		.select({ userId: calls.userId })
		.from(calls)
		.innerJoin(callSelections, eq(callSelections.callId, calls.id))
		.where(
			and(
				eq(calls.questionId, pick.questionId),
				inArray(calls.userId, others),
				ne(callSelections.optionId, pick.optionId),
			),
		)
		.limit(1)
	return row?.userId ?? null
}

// For a call being cast or redone: refuses a pick on another member's link
// question that isn't that link's side, in any chain the caller is in that
// the question can still decide. Locks those chains, in id order, so a join
// approved at the same moment can't slip past it.
export async function assertNoChainHedge(
	tx: Tx,
	input: { userId: string; questionId: string; optionIds: string[] },
): Promise<void> {
	if (input.optionIds.length === 0) return
	const mine = alias(chainLinks, "mine")
	const rows = await tx
		.selectDistinct({ chainId: chainLinks.chainId })
		.from(chainLinks)
		.innerJoin(
			mine,
			and(
				eq(mine.chainId, chainLinks.chainId),
				eq(mine.userId, input.userId),
				inArray(mine.status, ["requested", "approved"]),
			),
		)
		.where(
			and(
				eq(chainLinks.questionId, input.questionId),
				eq(chainLinks.status, "approved"),
				ne(chainLinks.userId, input.userId),
			),
		)
	if (rows.length === 0) return
	const chainIds = rows.map((row) => row.chainId).sort()
	const locked = await tx
		.select()
		.from(chains)
		.where(inArray(chains.id, chainIds))
		.orderBy(asc(chains.id))
		.for("update")
	const linksByChain = await loadChainLinks(chainIds, tx)
	for (const chain of locked) {
		const links = linksByChain.get(chain.id) ?? []
		if (!stillDeciding(chainPhase(chain, links))) continue
		const theirs = links.find(
			(link) =>
				link.status === "approved" &&
				link.questionId === input.questionId &&
				link.userId !== input.userId,
		)
		if (
			theirs?.pick &&
			input.optionIds.some((id) => id !== theirs.pick?.optionId)
		) {
			throw ValidationError.field(
				null,
				"That's the other side of a link in your chain. Leave the chain first.",
			)
		}
	}
}

// A call that's a link in a chain still being decided can't be redone: the
// chain was built on that pick and its chance.
export async function assertNotActiveLink(
	tx: Tx,
	callId: string,
): Promise<void> {
	const links = await tx.query.chainLinks.findMany({
		where: { callId, status: { in: ["requested", "approved"] } },
		columns: { chainId: true },
	})
	if (links.length === 0) return
	const chainIds = links.map((link) => link.chainId)
	const rows = await tx.query.chains.findMany({
		where: { id: { in: chainIds } },
	})
	const linksByChain = await loadChainLinks(chainIds, tx)
	for (const chain of rows) {
		if (stillDeciding(chainPhase(chain, linksByChain.get(chain.id) ?? []))) {
			throw ValidationError.field(
				null,
				"This call is a link in a chain. Leave the chain first.",
			)
		}
	}
}
