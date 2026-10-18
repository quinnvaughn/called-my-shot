import { formatChainMultiplier } from "@called-my-shot/scoring"
import { and, desc, eq, ne } from "drizzle-orm"
import { db } from "../../db"
import { comments, notifications } from "../../db/schema"
import { loadChainLinks } from "./load"
import { approvedLinks, chainResult } from "./state"

// What a chain's pushes say. Read at send time, like every other push, so
// one sent after an overturn tells the result as it stands.

export const chainPath = (chain: { id: string; groupId: string }) =>
	`/groups/${chain.groupId}/chains/${chain.id}`

async function usernameOf(userId: string): Promise<string | null> {
	const user = await db.query.users.findFirst({
		where: { id: userId },
		columns: { username: true },
	})
	return user?.username ?? null
}

// One line per chain this game settled for the user: "Your chain held. 16x."
// or "@dave broke the chain." Empty when none did, or none still stands.
export async function chainLinesFor(
	gameId: string,
	userId: string,
): Promise<string[]> {
	const rows = await db
		.select({ chainId: notifications.chainId })
		.from(notifications)
		.where(
			and(
				eq(notifications.userId, userId),
				eq(notifications.type, "chain_settled"),
				eq(notifications.gameId, gameId),
			),
		)
	const chainIds = rows.flatMap((row) => (row.chainId ? [row.chainId] : []))
	if (chainIds.length === 0) return []
	const linksByChain = await loadChainLinks(chainIds)
	const lines: string[] = []
	for (const chainId of chainIds) {
		const links = linksByChain.get(chainId) ?? []
		const result = chainResult(links)
		if (result.state === "held") {
			const mine = approvedLinks(links).find((link) => link.userId === userId)
			const mult = mine ? result.multipliers.get(mine.id) : undefined
			lines.push(
				mult
					? `Your chain held. ${formatChainMultiplier(mult)}.`
					: "Your chain held.",
			)
		}
		if (result.state === "broken" && result.breakerLinkId) {
			const breaker = links.find((link) => link.id === result.breakerLinkId)
			if (!breaker) continue
			if (breaker.userId === userId) {
				lines.push("You broke the chain.")
				continue
			}
			const username = await usernameOf(breaker.userId)
			lines.push(
				username ? `@${username} broke the chain.` : "The chain broke.",
			)
		}
	}
	return lines
}

// How many requests are waiting on the starter, for "@amy and 2 others want
// in".
export async function pendingRequestCount(chainId: string): Promise<number> {
	const rows = await db.query.chainLinks.findMany({
		where: { chainId, status: "requested" },
		columns: { id: true },
	})
	return rows.length
}

// Whether the user's request on this chain was approved, read live. Null
// once neither, as after they left.
export async function linkWasApproved(
	chainId: string,
	userId: string,
): Promise<boolean | null> {
	const link = await db.query.chainLinks.findFirst({
		where: { chainId, userId, status: { in: ["approved", "declined"] } },
		orderBy: { requestedAt: "desc" },
		columns: { status: true },
	})
	return link ? link.status === "approved" : null
}

// Who posted last in a chain's thread, other than the user.
export async function lastCommenter(
	chainId: string,
	userId: string,
): Promise<string | null> {
	const [row] = await db
		.select({ senderId: comments.senderId })
		.from(comments)
		.where(and(eq(comments.chainId, chainId), ne(comments.senderId, userId)))
		.orderBy(desc(comments.createdAt))
		.limit(1)
	return row ? usernameOf(row.senderId) : null
}

export async function loadChainForPush(chainId: string | null) {
	if (!chainId) return null
	const chain = await db.query.chains.findFirst({
		where: { id: chainId },
		columns: { id: true, groupId: true },
	})
	return chain ?? null
}
