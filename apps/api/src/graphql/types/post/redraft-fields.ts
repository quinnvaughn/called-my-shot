import type { RedraftLength } from "@called-my-shot/schemas"
import type { DraftSlot } from "../../../lib/drafts/class"
import { classLengths } from "../../../lib/drafts/class"
import { sharePercent } from "../../../lib/posts/consensus"
import {
	type CrowdPick,
	crowdRedraft,
} from "../../../lib/posts/redraft-consensus"
import { builder } from "../../builder"
import { ctxLoader } from "../../loader"
import { RedraftPromptRef } from "../prompt/refs"
import { PlayerRef, TeamRef } from "../sports"
import {
	classSlotsLoader,
	MAX_REDRAFT_SLOTS,
	originalPickLoader,
	playerByIdLoader,
	redraftConsensusLoader,
	teamByIdLoader,
} from "./loaders"

// A length the class can be redrafted at: a chip in the composer.
const RedraftLengthRef = builder
	.objectRef<RedraftLength>("RedraftLength")
	.implement({
		fields: (t) => ({
			count: t.int({ resolve: (l) => l.count }),
			label: t.string({ resolve: (l) => l.label }),
			isDefault: t.boolean({ resolve: (l) => l.isDefault }),
		}),
	})

// One of the class's real picks: the slot a redraft fills, the team that
// held it and who it took.
const DraftSlotRef = builder.objectRef<DraftSlot>("DraftSlot").implement({
	fields: (t) => ({
		slot: t.int({ resolve: (s) => s.slot }),
		overall: t.int({ resolve: (s) => s.overall ?? s.slot }),
		round: t.int({ nullable: true, resolve: (s) => s.round }),
		// Today's franchise for the team that held it. Null for one that folded.
		team: t.field({
			type: TeamRef,
			nullable: true,
			resolve: (s, _args, ctx) =>
				s.teamId ? teamByIdLoader(ctx).load(s.teamId) : null,
		}),
		// What that team was called that year.
		teamName: t.string({ nullable: true, resolve: (s) => s.teamName }),
		// Who it took. The player is null for a draftee this app has no player
		// for, mostly one who never played in the league.
		playerName: t.string({ resolve: (s) => s.playerName }),
		player: t.field({
			type: PlayerRef,
			nullable: true,
			resolve: (s, _args, ctx) =>
				s.playerId ? playerByIdLoader(ctx).load(s.playerId) : null,
		}),
	}),
})

type CrowdPickParent = CrowdPick & { leagueId: string | null }

// One slot of the crowd's redraft.
const CrowdRedraftPickRef = builder
	.objectRef<CrowdPickParent>("CrowdRedraftPick")
	.implement({
		fields: (t) => ({
			slot: t.int({ resolve: (p) => p.slot }),
			player: t.field({
				type: PlayerRef,
				resolve: async (p, _args, ctx) => {
					const player = await playerByIdLoader(ctx).load(p.playerId)
					if (!player) throw new Error("Crowd pick's player missing")
					return player
				},
			}),
			// The pick he really was. Null when he came in undrafted.
			originalOverall: t.int({
				nullable: true,
				resolve: (p, _args, ctx) =>
					originalPickLoader(ctx).load(`${p.leagueId}|${p.playerId}`),
			}),
			// How many of the public redrafts reaching this slot put him here.
			sharePercent: t.int({ resolve: (p) => sharePercent(p.share) }),
		}),
	})

const lengthsLoader = ctxLoader(
	async (
		prompts: {
			id: string
			leagueId: string | null
			draftYear: number | null
		}[],
	): Promise<RedraftLength[][]> =>
		Promise.all(prompts.map((prompt) => classLengths(prompt))),
	{ cacheKeyFn: (prompt) => prompt.id },
)

const defaultLength = (lengths: RedraftLength[]) =>
	lengths.find((length) => length.isDefault)?.count ??
	lengths[lengths.length - 1]?.count ??
	0

builder.objectFields(RedraftPromptRef, (t) => ({
	// What the composer offers, shortest first, one of them the default.
	lengths: t.field({
		type: [RedraftLengthRef],
		resolve: (p, _args, ctx) => lengthsLoader(ctx).load(p),
	}),
	// The class's first picks, as many as asked: by default as many as its
	// longest length.
	slots: t.field({
		type: [DraftSlotRef],
		args: { first: t.arg.int() },
		resolve: async (p, args, ctx) => {
			const slots = await classSlotsLoader(ctx).load(p)
			const longest = (await lengthsLoader(ctx).load(p)).reduce(
				(max, length) => Math.max(max, length.count),
				0,
			)
			const first = Math.min(args.first ?? longest, MAX_REDRAFT_SLOTS)
			return slots.slice(0, Math.max(0, first))
		},
	}),
	// The crowd's redraft, slot by slot, to `first` slots or the class's
	// default length.
	consensus: t.field({
		type: [CrowdRedraftPickRef],
		args: { first: t.arg.int() },
		resolve: async (p, args, ctx) => {
			const length =
				args.first ?? defaultLength(await lengthsLoader(ctx).load(p))
			const consensus = await redraftConsensusLoader(ctx).load(p.id)
			return crowdRedraft(consensus, Math.min(length, MAX_REDRAFT_SLOTS)).map(
				(pick) => ({ ...pick, leagueId: p.leagueId }),
			)
		},
	}),
}))
