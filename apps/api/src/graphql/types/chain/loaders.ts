import type { ChainResult } from "@called-my-shot/scoring"
import { db } from "../../../db"
import type { Chain } from "../../../db/schema"
import { type LoadedLink, loadChainLinks } from "../../../lib/chains/load"
import {
	type ChainPhase,
	chainLocksAt,
	chainPhase,
	chainResult,
} from "../../../lib/chains/state"
import { ctxLoader } from "../../loader"

// Everything a chain's fields read, worked out once per request.
export type ChainView = {
	chain: Chain
	links: LoadedLink[]
	phase: ChainPhase
	result: ChainResult
	locksAt: Date | null
}

export function buildChainView(
	chain: Chain,
	links: LoadedLink[],
	now = new Date(),
): ChainView {
	return {
		chain,
		links,
		phase: chainPhase(chain, links, now),
		result: chainResult(links),
		locksAt: chainLocksAt(links),
	}
}

// Keyed by id, so a chain reached from a notification, a group and a link
// all share one load.
export const chainViewLoader = ctxLoader(
	async (chainIds: string[]): Promise<(ChainView | null)[]> => {
		const [rows, links] = await Promise.all([
			db.query.chains.findMany({ where: { id: { in: chainIds } } }),
			loadChainLinks(chainIds),
		])
		const byId = new Map(rows.map((row) => [row.id, row]))
		return chainIds.map((id) => {
			const chain = byId.get(id)
			return chain ? buildChainView(chain, links.get(id) ?? []) : null
		})
	},
)

export async function requireChainView(
	ctx: Parameters<typeof chainViewLoader>[0],
	chainId: string,
): Promise<ChainView> {
	const view = await chainViewLoader(ctx).load(chainId)
	if (!view) throw new Error("Chain missing")
	return view
}
