import { CHAIN_MAX_LINKS, chainMultiplier } from "@called-my-shot/scoring"
import { count, eq } from "drizzle-orm"
import { db } from "../../../db"
import { comments } from "../../../db/schema"
import { linkCandidates } from "../../../lib/chains/candidates"
import { canCommentOnChain } from "../../../lib/chains/comment"
import { approvedLinks } from "../../../lib/chains/state"
import { chainTimeline } from "../../../lib/chains/timeline"
import { keysetPaginate } from "../../../lib/pagination"
import type { Context } from "../../context"
import { CommentConnectionRef, visibleComments } from "../comment"
import { GroupRef } from "../group/refs"
import { UserRef } from "../user"
import { type ChainView, requireChainView } from "./loaders"
import {
	ChainEventRef,
	ChainLinkRef,
	ChainPhaseEnum,
	ChainRef,
	LinkCandidateRef,
} from "./refs"

const ACTIVE = new Set(["requested", "approved"])

const linkParents = (view: ChainView, links = view.links) =>
	links.map((link) => ({ view, link }))

// The viewer's place in the chain, approved or waiting.
const viewerLinkOf = (view: ChainView, ctx: Context) =>
	ctx.user
		? view.links.find(
				(link) => link.userId === ctx.user?.id && ACTIVE.has(link.status),
			)
		: undefined

// Why the viewer can't add a link right now, or null when they can.
function joinBlockedReason(view: ChainView, ctx: Context): string | null {
	if (!ctx.user) return "Sign in to join."
	if (view.phase !== "open") return "This chain isn't taking links."
	const mine = view.links.filter((link) => link.userId === ctx.user?.id)
	if (mine.some((link) => link.status === "approved")) {
		return "You're in this chain."
	}
	if (mine.some((link) => link.status === "requested")) {
		return "Your link is waiting on a yes."
	}
	if (mine.some((link) => link.status === "declined")) {
		return "Your link on this chain was turned down."
	}
	if (approvedLinks(view.links).length >= CHAIN_MAX_LINKS) {
		return `This chain is full at ${CHAIN_MAX_LINKS} links.`
	}
	return null
}

ChainRef.implement({
	fields: (t) => ({
		id: t.exposeID("id"),
		createdAt: t.field({ type: "DateTime", resolve: (c) => c.createdAt }),
		group: t.field({
			type: GroupRef,
			nullable: true,
			resolve: (c) =>
				db.query.groups
					.findFirst({ where: { id: c.groupId } })
					.then((group) => group ?? null),
		}),
		starter: t.field({
			type: UserRef,
			nullable: true,
			resolve: (c) =>
				c.starterId
					? db.query.users
							.findFirst({ where: { id: c.starterId } })
							.then((user) => user ?? null)
					: null,
		}),
		phase: t.field({
			type: ChainPhaseEnum,
			resolve: async (c, _args, ctx) =>
				(await requireChainView(ctx, c.id)).phase,
		}),
		// When the chain stops taking links: its earliest link's lock.
		locksAt: t.field({
			type: "DateTime",
			nullable: true,
			resolve: async (c, _args, ctx) =>
				(await requireChainView(ctx, c.id)).locksAt,
		}),
		// Every link in the chain, in the order their games start.
		links: t.field({
			type: [ChainLinkRef],
			resolve: async (c, _args, ctx) => {
				const view = await requireChainView(ctx, c.id)
				return linkParents(
					view,
					[...approvedLinks(view.links)].sort(
						(a, b) => a.game.startsAt.getTime() - b.game.startsAt.getTime(),
					),
				)
			},
		}),
		// Requests waiting on the starter. Only the starter sees them, and only
		// while the chain is open: anything still waiting at lock expired.
		pendingRequests: t.field({
			type: [ChainLinkRef],
			resolve: async (c, _args, ctx) => {
				const view = await requireChainView(ctx, c.id)
				if (ctx.user?.id !== c.starterId || view.phase !== "open") return []
				return linkParents(
					view,
					view.links.filter((link) => link.status === "requested"),
				)
			},
		}),
		viewerIsStarter: t.boolean({
			resolve: (c, _args, ctx) =>
				ctx.user !== null && ctx.user?.id === c.starterId,
		}),
		viewerLink: t.field({
			type: ChainLinkRef,
			nullable: true,
			resolve: async (c, _args, ctx) => {
				const view = await requireChainView(ctx, c.id)
				const link = viewerLinkOf(view, ctx)
				return link ? { view, link } : null
			},
		}),
		// What a new link's multiplier would be: every link already in.
		multiplierForNewLink: t.float({
			resolve: async (c, _args, ctx) => {
				const view = await requireChainView(ctx, c.id)
				return chainMultiplier(
					approvedLinks(view.links)
						.filter((link) => link.userId !== ctx.user?.id)
						.map((link) => link.hitChance),
				)
			},
		}),
		viewerJoinBlockedReason: t.string({
			nullable: true,
			resolve: async (c, _args, ctx) =>
				joinBlockedReason(await requireChainView(ctx, c.id), ctx),
		}),
		// The viewer's open calls, each with whether it can go in this chain.
		viewerLinkCandidates: t.field({
			type: [LinkCandidateRef],
			resolve: async (c, _args, ctx) => {
				if (!ctx.user) return []
				const view = await requireChainView(ctx, c.id)
				if (joinBlockedReason(view, ctx)) return []
				return linkCandidates({
					userId: ctx.user.id,
					groupId: c.groupId,
					links: view.links,
				})
			},
		}),
		breaker: t.field({
			type: ChainLinkRef,
			nullable: true,
			resolve: async (c, _args, ctx) => {
				const view = await requireChainView(ctx, c.id)
				const link = view.links.find((l) => l.id === view.result.breakerLinkId)
				return link && view.phase === "broken" ? { view, link } : null
			},
		}),
		// What happened to the chain, oldest first: who joined, the lock, each
		// link landing, how it ended.
		events: t.field({
			type: [ChainEventRef],
			resolve: async (c, _args, ctx) => {
				const view = await requireChainView(ctx, c.id)
				return chainTimeline({
					chain: c,
					links: view.links,
					viewerId: ctx.user?.id ?? null,
				}).map((event) => ({ view, event }))
			},
		}),
		// What the group said about it, newest first, a page at a time: a chat
		// opens on its latest messages and reaches back as it's scrolled up.
		comments: t.field({
			type: CommentConnectionRef,
			args: { first: t.arg.int(), after: t.arg.string() },
			resolve: async (c, args, ctx) => {
				const page = await keysetPaginate(args, (keyset) =>
					db.query.comments.findMany({
						where: { chainId: c.id, ...keyset.where },
						orderBy: keyset.orderBy,
						limit: keyset.limit,
					}),
				)
				return { ...page, items: await visibleComments(ctx, page.items) }
			},
		}),
		commentCount: t.int({
			resolve: async (c) => {
				const [row] = await db
					.select({ n: count() })
					.from(comments)
					.where(eq(comments.chainId, c.id))
				return row?.n ?? 0
			},
		}),
		viewerCanComment: t.boolean({
			resolve: (c, _args, ctx) =>
				ctx.user ? canCommentOnChain(ctx.user.id, c) : false,
		}),
	}),
})
