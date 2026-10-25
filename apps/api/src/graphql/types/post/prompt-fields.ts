import { db } from "../../../db"
import { CONSENSUS_SIZE, sharePercent } from "../../../lib/posts/consensus"
import { promptAnswers } from "../../../lib/posts/feeds"
import { canViewPost } from "../../../lib/posts/visibility"
import { isUuid } from "../../../lib/uuid"
import { builder } from "../../builder"
import { ctxLoader, indexByKey } from "../../loader"
import { RushmorePromptRef } from "../prompt/refs"
import { PlayerRef, TeamRef } from "../sports"
import { consensusLoader, playerByIdLoader } from "./loaders"
import { AnswerSortEnum, PostConnectionRef, PostInterfaceRef } from "./refs"

type ConsensusEntry = { playerId: string; count: number; share: number }

// One face on the crowd's Rushmore: how many public answers have this
// player, and that as a share of all of them.
const ConsensusPickRef = builder
	.objectRef<ConsensusEntry>("ConsensusPick")
	.implement({
		fields: (t) => ({
			player: t.field({
				type: PlayerRef,
				resolve: async (p, _args, ctx) => {
					const player = await playerByIdLoader(ctx).load(p.playerId)
					if (!player) throw new Error("Consensus player missing")
					return player
				},
			}),
			count: t.int({ resolve: (p) => p.count }),
			sharePercent: t.int({ resolve: (p) => sharePercent(p.share) }),
		}),
	})

builder.objectFields(RushmorePromptRef, (t) => ({
	// Public answers. Group answers stay in their group and aren't counted.
	answerCount: t.int({
		resolve: async (p, _args, ctx) =>
			(await consensusLoader(ctx).load(p.id)).answerCount,
	}),
	// The most-picked players, most first: the crowd's Rushmore at the
	// default of four, further down the list with a bigger first.
	consensus: t.field({
		type: [ConsensusPickRef],
		args: { first: t.arg.int({ defaultValue: CONSENSUS_SIZE }) },
		resolve: async (p, args, ctx) =>
			(await consensusLoader(ctx).load(p.id)).picks.slice(
				0,
				Math.max(0, args.first ?? CONSENSUS_SIZE),
			),
	}),
	// The viewer's own answer: the public one, or the one in groupId. Null
	// when they haven't made one, which is when "Make yours" shows.
	viewerAnswer: t.field({
		type: PostInterfaceRef,
		nullable: true,
		args: { groupId: t.arg.id() },
		resolve: async (p, args, ctx) => {
			const groupId = args.groupId ? String(args.groupId) : null
			if (!ctx.user || (groupId && !isUuid(groupId))) return null
			const post = await db.query.posts.findFirst({
				where: {
					authorId: ctx.user.id,
					promptId: p.id,
					groupId: groupId ?? { isNull: true },
					removedAt: { isNull: true },
				},
			})
			return post ?? null
		},
	}),
	// Someone's public answer, by their username: what
	// /rushmore/{prompt}/{username} opens. Null when they haven't made one, or
	// the viewer can't see it.
	publicAnswerBy: t.field({
		type: PostInterfaceRef,
		nullable: true,
		args: { username: t.arg.string({ required: true }) },
		resolve: async (p, args, ctx) => {
			const author = await db.query.users.findFirst({
				where: { username: { ilike: args.username.trim() } },
				columns: { id: true },
			})
			if (!author) return null
			const post = await db.query.posts.findFirst({
				where: {
					authorId: author.id,
					promptId: p.id,
					groupId: { isNull: true },
				},
			})
			if (!post) return null
			return (await canViewPost(db, ctx.user?.id ?? null, { post, prompt: p }))
				? post
				: null
		},
	}),
	answers: t.field({
		type: PostConnectionRef,
		args: {
			sort: t.arg({ type: AnswerSortEnum, defaultValue: "top" }),
			first: t.arg.int(),
			after: t.arg.string(),
		},
		resolve: (p, args, ctx) =>
			promptAnswers(ctx.user?.id ?? null, p.id, args.sort ?? "top", args),
	}),
}))

// A franchise's own prompt, for the team space's consensus card and its
// "Make yours". Null for a team in a league the app doesn't sync, or one an
// admin took down. Batched, since a league's team grid asks for all of them
// at once.
const franchisePromptLoader = ctxLoader(async (teamIds: string[]) => {
	const rows = await db.query.prompts.findMany({
		where: {
			teamId: { in: teamIds },
			creatorId: { isNull: true },
			removedAt: { isNull: true },
		},
	})
	return indexByKey(teamIds, rows, (row) => row.teamId ?? "", null)
})

builder.objectFields(TeamRef, (t) => ({
	rushmorePrompt: t.field({
		type: RushmorePromptRef,
		nullable: true,
		resolve: (team, _args, ctx) => franchisePromptLoader(ctx).load(team.id),
	}),
}))
