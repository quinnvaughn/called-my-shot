import { chainMultiplier } from "@called-my-shot/scoring"
import { db } from "../../../db"
import type { Chain } from "../../../db/schema"
import { type LoadedLink, linkOutcome } from "../../../lib/chains/load"
import { approvedLinks } from "../../../lib/chains/state"
import type { ChainEvent } from "../../../lib/chains/timeline"
import { builder } from "../../builder"
import { type Connection, PageInfoRef } from "../pagination"
import { CallRef } from "../question"
import { GameRef } from "../sports"
import { UserRef } from "../user"
import type { ChainView } from "./loaders"

export const ChainPhaseEnum = builder.enumType("ChainPhase", {
	values: {
		OPEN: { value: "open" },
		LIVE: { value: "live" },
		HELD: { value: "held" },
		BROKEN: { value: "broken" },
		VOID: { value: "void" },
		CALLED_OFF: { value: "called_off" },
	} as const,
})

export const ChainLinkStatusEnum = builder.enumType("ChainLinkStatus", {
	values: {
		REQUESTED: { value: "requested" },
		APPROVED: { value: "approved" },
		DECLINED: { value: "declined" },
		LEFT: { value: "left" },
		RELEASED: { value: "released" },
	} as const,
})

export const ChainLinkOutcomeEnum = builder.enumType("ChainLinkOutcome", {
	values: {
		HIT: { value: "hit" },
		MISS: { value: "miss" },
		PENDING: { value: "pending" },
		VOID: { value: "void" },
	} as const,
})

export const ChainEventKindEnum = builder.enumType("ChainEventKind", {
	values: {
		STARTED: { value: "started" },
		JOINED: { value: "joined" },
		DECLINED: { value: "declined" },
		LEFT: { value: "left" },
		CALLED_OFF: { value: "called_off" },
		LOCKED: { value: "locked" },
		LINK_HIT: { value: "link_hit" },
		LINK_MISSED: { value: "link_missed" },
		BROKEN: { value: "broken" },
		HELD: { value: "held" },
	} as const,
})

export const ChainRef = builder.objectRef<Chain>("Chain")

export const ChainConnectionRef = builder
	.objectRef<Connection<Chain>>("ChainConnection")
	.implement({
		fields: (t) => ({
			items: t.field({ type: [ChainRef], resolve: (c) => c.items }),
			pageInfo: t.field({ type: PageInfoRef, resolve: (c) => c.pageInfo }),
		}),
	})

export type ChainLinkParent = { view: ChainView; link: LoadedLink }

const userById = (id: string) =>
	db.query.users.findFirst({ where: { id } }).then((user) => user ?? null)

export const ChainLinkRef = builder
	.objectRef<ChainLinkParent>("ChainLink")
	.implement({
		fields: (t) => ({
			id: t.id({ resolve: (p) => p.link.id }),
			user: t.field({
				type: UserRef,
				nullable: true,
				resolve: (p) => userById(p.link.userId),
			}),
			call: t.field({
				type: CallRef,
				nullable: true,
				resolve: (p) =>
					db.query.calls
						.findFirst({ where: { id: p.link.callId } })
						.then((call) => call ?? null),
			}),
			game: t.field({
				type: GameRef,
				nullable: true,
				resolve: (p) =>
					db.query.games
						.findFirst({ where: { id: p.link.gameId } })
						.then((game) => game ?? null),
			}),
			status: t.field({
				type: ChainLinkStatusEnum,
				resolve: (p) => p.link.status,
			}),
			hitChance: t.float({ resolve: (p) => p.link.hitChance }),
			// This member's multiplier: how unlikely every other link is. For a
			// request, what it would be if approved.
			multiplier: t.float({
				resolve: (p) =>
					p.view.result.multipliers.get(p.link.id) ??
					chainMultiplier(
						approvedLinks(p.view.links)
							.filter((link) => link.id !== p.link.id)
							.map((link) => link.hitChance),
					),
			}),
			outcome: t.field({
				type: ChainLinkOutcomeEnum,
				resolve: (p) => linkOutcome(p.link),
			}),
			// What the chain added to or took back from this member's link.
			// Null until the chain settles it.
			award: t.int({
				nullable: true,
				resolve: (p) =>
					p.view.result.awards.find((award) => award.linkId === p.link.id)
						?.points ?? null,
			}),
			isBreaker: t.boolean({
				resolve: (p) => p.view.result.breakerLinkId === p.link.id,
			}),
			requestedAt: t.field({
				type: "DateTime",
				resolve: (p) => p.link.requestedAt,
			}),
		}),
	})

export type ChainEventParent = { view: ChainView; event: ChainEvent }

export const ChainEventRef = builder
	.objectRef<ChainEventParent>("ChainEvent")
	.implement({
		fields: (t) => ({
			kind: t.field({ type: ChainEventKindEnum, resolve: (p) => p.event.kind }),
			at: t.field({ type: "DateTime", resolve: (p) => p.event.at }),
			actor: t.field({
				type: UserRef,
				nullable: true,
				resolve: (p) => (p.event.actorId ? userById(p.event.actorId) : null),
			}),
			link: t.field({
				type: ChainLinkRef,
				nullable: true,
				resolve: (p) => {
					const link = p.view.links.find((l) => l.id === p.event.linkId)
					return link ? { view: p.view, link } : null
				},
			}),
			linkCount: t.int({ nullable: true, resolve: (p) => p.event.linkCount }),
			viewerMultiplier: t.float({
				nullable: true,
				resolve: (p) => p.event.viewerMultiplier,
			}),
			previousViewerMultiplier: t.float({
				nullable: true,
				resolve: (p) => p.event.previousViewerMultiplier,
			}),
			zeroedCount: t.int({
				nullable: true,
				resolve: (p) => p.event.zeroedCount,
			}),
		}),
	})

export const LinkCandidateRef = builder
	.objectRef<{
		callId: string
		hitChance: number | null
		reason: string | null
	}>("ChainLinkCandidate")
	.implement({
		fields: (t) => ({
			call: t.field({
				type: CallRef,
				nullable: true,
				resolve: (p) =>
					db.query.calls
						.findFirst({ where: { id: p.callId } })
						.then((call) => call ?? null),
			}),
			hitChance: t.float({ nullable: true, resolve: (p) => p.hitChance }),
			// Why it can't be a link, or null when it can.
			reason: t.string({ nullable: true, resolve: (p) => p.reason }),
		}),
	})
