import { and, eq, inArray } from "drizzle-orm"
import { db } from "../../../db"
import { chainLinks, chains } from "../../../db/schema"
import { linkCandidates } from "../../../lib/chains/candidates"
import { loadChainLinks } from "../../../lib/chains/load"
import { keysetPaginate } from "../../../lib/pagination"
import { builder } from "../../builder"
import { type Context, ctxCache } from "../../context"
import { ctxLoader } from "../../loader"
import { viewerMembership } from "../group/leaderboard"
import { GroupRef } from "../group/refs"
import { CallRef } from "../question"
import { buildChainView, type ChainView, chainViewLoader } from "./loaders"
import { ChainConnectionRef, ChainRef, LinkCandidateRef } from "./refs"

// The group's chains that haven't settled or been called off, with their
// views, newest first: the ones taking links or playing out, plus any that
// locked with one link and never counted. Primed into the view loader, so the
// fields each chain resolves don't load it again. Cached for the request,
// since the list and the tab's count both read it.
function unsettledChains(ctx: Context, groupId: string) {
	return ctxCache(ctx, `unsettledChains:${groupId}`, async () => {
		const rows = await db.query.chains.findMany({
			where: {
				groupId,
				announcedOutcome: { isNull: true },
				cancelledAt: { isNull: true },
			},
			orderBy: { createdAt: "desc" },
		})
		const links = await loadChainLinks(rows.map((row) => row.id))
		const loader = chainViewLoader(ctx)
		return rows.map((chain) => {
			const view = buildChainView(chain, links.get(chain.id) ?? [])
			loader.prime(chain.id, view)
			return view
		})
	})
}

const isActive = (view: ChainView) =>
	view.phase === "open" || view.phase === "live"

builder.objectFields(GroupRef, (t) => ({
	// Chains taking links or still playing out, newest first. Members only.
	activeChains: t.field({
		type: [ChainRef],
		resolve: async (group, _args, ctx) => {
			if (!(await viewerMembership(ctx, group.id))) return []
			const views = await unsettledChains(ctx, group.id)
			return views.filter(isActive).map((view) => view.chain)
		},
	}),
	// Chains that held or broke, newest first, a page at a time. Read off the
	// result each one was last announced with, so an old group's history costs
	// one indexed query rather than working out every chain's state. Called
	// off chains and ones that never counted aren't here. Members only.
	finishedChains: t.field({
		type: ChainConnectionRef,
		args: { first: t.arg.int(), after: t.arg.string() },
		resolve: async (group, args, ctx) => {
			if (!(await viewerMembership(ctx, group.id))) {
				return { items: [], pageInfo: { hasNextPage: false, endCursor: null } }
			}
			return keysetPaginate(args, (page) =>
				db.query.chains.findMany({
					where: {
						groupId: group.id,
						announcedOutcome: { isNotNull: true },
						...page.where,
					},
					orderBy: page.orderBy,
					limit: page.limit,
				}),
			)
		},
	}),
	// Chains taking links or still being decided, for the count on the tab.
	activeChainCount: t.int({
		resolve: async (group, _args, ctx) => {
			if (!(await viewerMembership(ctx, group.id))) return 0
			const views = await unsettledChains(ctx, group.id)
			return views.filter(isActive).length
		},
	}),
	// The viewer's open calls, each with whether it can start a chain here.
	viewerChainCandidates: t.field({
		type: [LinkCandidateRef],
		resolve: async (group, _args, ctx) => {
			if (!ctx.user || !(await viewerMembership(ctx, group.id))) return []
			return linkCandidates({
				userId: ctx.user.id,
				groupId: group.id,
				links: null,
			})
		},
	}),
}))

builder.queryFields((t) => ({
	// One chain, for its page. Null to anyone outside its group.
	chain: t.field({
		type: ChainRef,
		nullable: true,
		args: { id: t.arg.id({ required: true }) },
		resolve: async (_root, args, ctx) => {
			const view = await chainViewLoader(ctx).load(String(args.id))
			if (!view || !(await viewerMembership(ctx, view.chain.groupId))) {
				return null
			}
			return view.chain
		},
	}),
}))

// Which of a page of calls broke a chain, read off the breaker each chain
// last announced, so it only marks a chain that has settled broken.
const brokeChainLoader = ctxLoader(
	async (callIds: string[]): Promise<boolean[]> => {
		const rows = await db
			.select({ callId: chainLinks.callId })
			.from(chainLinks)
			.innerJoin(
				chains,
				and(
					eq(chains.announcedBreakerLinkId, chainLinks.id),
					eq(chains.announcedOutcome, "broken"),
				),
			)
			.where(inArray(chainLinks.callId, callIds))
		const broke = new Set(rows.map((row) => row.callId))
		return callIds.map((id) => broke.has(id))
	},
)

builder.objectFields(CallRef, (t) => ({
	brokeChain: t.boolean({
		resolve: (call, _args, ctx) => brokeChainLoader(ctx).load(call.id),
	}),
}))
