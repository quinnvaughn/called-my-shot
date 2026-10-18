import { eq } from "drizzle-orm"
import { type ChainOutcome, chains } from "../../db/schema"
import type { Tx } from "../../db/types"
import { createNotifications } from "../notifications"
import { reconcileAwards } from "../point-awards"
import { type LoadedLink, loadChainLinks } from "./load"
import { approvedLinks, chainResult } from "./state"

// The game that settled a chain, which its result is told with: the
// breaker's game when it broke, the last link to go final when it held.
function settlingGameId(
	links: LoadedLink[],
	breakerLinkId: string | null,
): string | null {
	if (breakerLinkId) {
		return links.find((link) => link.id === breakerLinkId)?.gameId ?? null
	}
	const last = [...links].sort(
		(a, b) =>
			(b.game.finalizedAt ?? b.game.startsAt).getTime() -
			(a.game.finalizedAt ?? a.game.startsAt).getTime(),
	)[0]
	return last?.gameId ?? null
}

// Brings one chain's awards in line with where its links stand, and tells
// its members when it has newly held or broken - or broken on someone else.
// Runs from the drain, after the settle that moved a link has committed.
export async function recomputeChain(
	tx: Tx,
	chainId: string,
	{ notify = true }: { notify?: boolean } = {},
): Promise<void> {
	const [chain] = await tx
		.select()
		.from(chains)
		.where(eq(chains.id, chainId))
		.for("update")
	if (!chain) return

	const links = (await loadChainLinks([chain.id], tx)).get(chain.id) ?? []
	const approved = approvedLinks(links)
	const result = chain.cancelledAt
		? { state: "void" as const, breakerLinkId: null, awards: [] }
		: chainResult(links)

	const byLinkId = new Map(approved.map((link) => [link.id, link]))
	await reconcileAwards(
		tx,
		"chain",
		chain.id,
		result.awards.flatMap((award) => {
			const link = byLinkId.get(award.linkId)
			return link
				? [
						{
							userId: award.userId,
							leagueId: link.question.leagueId,
							seasonId: link.question.seasonId,
							sourceKey: award.userId,
							gameId: link.gameId,
							points: award.points,
						},
					]
				: []
		}),
	)

	const outcome: ChainOutcome | null =
		result.state === "held" || result.state === "broken" ? result.state : null
	if (
		outcome === chain.announcedOutcome &&
		result.breakerLinkId === chain.announcedBreakerLinkId
	) {
		return
	}
	await tx
		.update(chains)
		.set({
			announcedOutcome: outcome,
			announcedBreakerLinkId: result.breakerLinkId,
		})
		.where(eq(chains.id, chain.id))
	if (!notify || !outcome) return

	const gameId = settlingGameId(approved, result.breakerLinkId)
	const group = await tx.query.groups.findFirst({
		where: { id: chain.groupId },
		columns: { id: true, name: true },
	})
	if (!gameId || !group) return
	await createNotifications(
		tx,
		[...new Set(approved.map((link) => link.userId))].map((userId) => ({
			type: "chain_settled" as const,
			userId,
			chainId: chain.id,
			groupId: group.id,
			groupName: group.name,
			gameId,
		})),
	)
}
