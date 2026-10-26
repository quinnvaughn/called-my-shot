import { match } from "ts-pattern"
import { db } from "../../../db"
import type {
	Post,
	PostTag,
	Prompt,
	RedraftPick,
	RushmorePick,
} from "../../../db/schema"
import { postLikeCountLoader, viewerLikedPostLoader } from "../../../lib/likes"
import { canCommentOnPost } from "../../../lib/posts/comment"
import {
	topLevelComment,
	topLevelComments,
} from "../../../lib/posts/comment-thread"
import { sharePercent } from "../../../lib/posts/consensus"
import { slotShare } from "../../../lib/posts/redraft-consensus"
import { isUuid } from "../../../lib/uuid"
import { builder } from "../../builder"
import { CommentConnectionRef, CommentRef } from "../comment"
import { type Connection, PageInfoRef } from "../pagination"
import { RedraftPromptRef, RushmorePromptRef } from "../prompt/refs"
import { LeagueRef, PlayerRef, TeamRef } from "../sports"
import {
	classSlotsLoader,
	commentCountLoader,
	consensusLoader,
	leagueByIdLoader,
	originalPickLoader,
	picksByPostLoader,
	playerByIdLoader,
	promptByIdLoader,
	redraftConsensusLoader,
	redraftPicksByPostLoader,
	tagsByPostLoader,
	teamByIdLoader,
} from "./loaders"

export const SpaceKindEnum = builder.enumType("SpaceKind", {
	values: {
		LEAGUE: { value: "league" },
		TEAM: { value: "team" },
		PLAYER: { value: "player" },
	} as const,
})

export const PostTagRoleEnum = builder.enumType("PostTagRole", {
	values: {
		SUBJECT: { value: "subject" },
		MENTION: { value: "mention" },
	} as const,
})

// Top is most liked first, newest breaking ties.
export const CommentSortEnum = builder.enumType("CommentSort", {
	values: {
		TOP: { value: "top" },
		NEWEST: { value: "newest" },
	} as const,
})

export const AnswerSortEnum = builder.enumType("AnswerSort", {
	values: {
		TOP: { value: "top" },
		NEWEST: { value: "newest" },
	} as const,
})

// A space a post shows up in. Exactly one of league, team and player is set,
// matching kind.
export const PostTagRef = builder.objectRef<PostTag>("PostTag").implement({
	fields: (t) => ({
		kind: t.field({ type: SpaceKindEnum, resolve: (tag) => tag.spaceKind }),
		role: t.field({ type: PostTagRoleEnum, resolve: (tag) => tag.role }),
		spaceId: t.id({ resolve: (tag) => tag.spaceId }),
		league: t.field({
			type: LeagueRef,
			nullable: true,
			resolve: (tag, _args, ctx) =>
				tag.spaceKind === "league"
					? leagueByIdLoader(ctx).load(tag.spaceId)
					: null,
		}),
		team: t.field({
			type: TeamRef,
			nullable: true,
			resolve: (tag, _args, ctx) =>
				tag.spaceKind === "team" ? teamByIdLoader(ctx).load(tag.spaceId) : null,
		}),
		player: t.field({
			type: PlayerRef,
			nullable: true,
			resolve: (tag, _args, ctx) =>
				tag.spaceKind === "player"
					? playerByIdLoader(ctx).load(tag.spaceId)
					: null,
		}),
	}),
})

// What every kind of post has, whatever it's made of. Each kind is a
// variant over the same posts row (RushmorePost, RedraftPost), the same
// pattern as NotificationNode.
export const PostInterfaceRef = builder.drizzleInterface("posts", {
	name: "Post",
	resolveType: (post) =>
		match(post.kind)
			.with("rushmore", () => "RushmorePost")
			.with("redraft", () => "RedraftPost")
			.exhaustive(),
	fields: (t) => ({
		id: t.exposeID("id"),
		createdAt: t.field({ type: "DateTime", resolve: (p) => p.createdAt }),
		// Set once the author has changed the words since posting.
		editedAt: t.field({
			type: "DateTime",
			nullable: true,
			resolve: (p) => p.editedAt,
		}),
		author: t.relation("author"),
		// The group it was posted in. Null for a public post.
		group: t.relation("group", { nullable: true }),
		body: t.exposeString("body", { nullable: true }),
		// Taken down off a report. Only an admin reading the report sees one.
		removed: t.boolean({ resolve: (p) => p.removedAt !== null }),
		tags: t.field({
			type: [PostTagRef],
			resolve: (p, _args, ctx) => tagsByPostLoader(ctx).load(p.id),
		}),
		// Every comment the viewer can see, replies included.
		commentCount: t.int({
			resolve: (p, _args, ctx) => commentCountLoader(ctx).load(p.id),
		}),
		likeCount: t.int({
			resolve: (p, _args, ctx) => postLikeCountLoader(ctx).load(p.id),
		}),
		viewerLiked: t.boolean({
			resolve: (p, _args, ctx) => viewerLikedPostLoader(ctx).load(p.id),
		}),
		viewerIsAuthor: t.boolean({
			resolve: (p, _args, ctx) => ctx.user?.id === p.authorId,
		}),
		viewerCanComment: t.boolean({
			resolve: async (p, _args, ctx) => {
				if (!ctx.user) return false
				const prompt = await promptByIdLoader(ctx).load(p.promptId)
				return prompt
					? canCommentOnPost(ctx.user.id, { post: p, prompt })
					: false
			},
		}),
		// Its prompt's code. Null for a group post, which is never shared off
		// the app.
		shareCode: t.string({
			nullable: true,
			resolve: async (p, _args, ctx) => {
				if (p.groupId) return null
				return (await promptByIdLoader(ctx).load(p.promptId))?.code ?? null
			},
		}),
		// The address printed on its share image and handed out when it's
		// shared, /rushmore/{prompt}/{author} or /redraft/{class}/{author}: one
		// person has one public answer per prompt, so the two name it. Null for
		// a group post.
		sharePath: t.string({
			nullable: true,
			resolve: async (p, _args, ctx) => {
				if (p.groupId) return null
				const [prompt, author] = await Promise.all([
					promptByIdLoader(ctx).load(p.promptId),
					db.query.users.findFirst({
						where: { id: p.authorId },
						columns: { username: true },
					}),
				])
				return prompt && author
					? `/${prompt.kind}/${prompt.code}/${author.username}`
					: null
			},
		}),
		// Top-level comments, a page at a time. Each carries its first replies
		// (Comment.replies) and how many there are.
		comments: t.field({
			type: CommentConnectionRef,
			args: {
				sort: t.arg({ type: CommentSortEnum, defaultValue: "top" }),
				first: t.arg.int(),
				after: t.arg.string(),
			},
			resolve: (p, args, ctx) =>
				topLevelComments(ctx.user?.id ?? null, p.id, {
					sort: args.sort ?? "top",
					first: args.first,
					after: args.after,
				}),
		}),
		// One top-level comment, for reading its replies past the ones the
		// thread shows inline.
		comment: t.field({
			type: CommentRef,
			nullable: true,
			args: { id: t.arg.id({ required: true }) },
			resolve: (p, args, ctx) => {
				const id = String(args.id)
				if (!isUuid(id)) return null
				return topLevelComment(ctx.user?.id ?? null, p.id, id)
			},
		}),
	}),
})

export type PickParent = { pick: RushmorePick; promptId: string }

// One face on a Rushmore. sharePercent is how many of the prompt's public
// answers have this player on them ("88% have him").
export const RushmorePickRef = builder
	.objectRef<PickParent>("RushmorePick")
	.implement({
		fields: (t) => ({
			player: t.field({
				type: PlayerRef,
				resolve: async (p, _args, ctx) => {
					const player = await playerByIdLoader(ctx).load(p.pick.playerId)
					if (!player) throw new Error("Rushmore pick's player missing")
					return player
				},
			}),
			// Where the author put this face, 0 to 3 left to right. Not a rank.
			position: t.int({ resolve: (p) => p.pick.position }),
			sharePercent: t.int({
				resolve: async (p, _args, ctx) => {
					const consensus = await consensusLoader(ctx).load(p.promptId)
					const entry = consensus.picks.find(
						(pick) => pick.playerId === p.pick.playerId,
					)
					return entry ? sharePercent(entry.share) : 0
				},
			}),
		}),
	})

export const RushmorePostRef = builder.drizzleObject("posts", {
	variant: "RushmorePost",
	interfaces: [PostInterfaceRef],
	fields: (t) => ({
		prompt: t.field({
			type: RushmorePromptRef,
			resolve: async (p, _args, ctx) => {
				const prompt = await promptByIdLoader(ctx).load(p.promptId)
				if (!prompt) throw new Error("Post's prompt missing")
				return prompt
			},
		}),
		// The four faces, left to right.
		picks: t.field({
			type: [RushmorePickRef],
			resolve: async (p, _args, ctx) =>
				(await picksByPostLoader(ctx).load(p.id)).map((pick) => ({
					pick,
					promptId: p.promptId,
				})),
		}),
	}),
})

export type RedraftPickParent = { pick: RedraftPick; prompt: Prompt }

// One slot on a redraft: who the author would take there now, the team that
// held the pick, and where that player really went.
export const RedraftPickRef = builder
	.objectRef<RedraftPickParent>("RedraftPick")
	.implement({
		fields: (t) => ({
			slot: t.int({ resolve: (p) => p.pick.slot }),
			player: t.field({
				type: PlayerRef,
				resolve: async (p, _args, ctx) => {
					const player = await playerByIdLoader(ctx).load(p.pick.playerId)
					if (!player) throw new Error("Redraft pick's player missing")
					return player
				},
			}),
			// Today's franchise for the team that held this pick. Null for one
			// that folded.
			slotTeam: t.field({
				type: TeamRef,
				nullable: true,
				resolve: async (p, _args, ctx) => {
					const slots = await classSlotsLoader(ctx).load(p.prompt)
					const teamId = slots[p.pick.slot - 1]?.teamId
					return teamId ? teamByIdLoader(ctx).load(teamId) : null
				},
			}),
			// What that team was called the year of the draft ("Seattle
			// SuperSonics").
			slotTeamName: t.string({
				nullable: true,
				resolve: async (p, _args, ctx) =>
					(await classSlotsLoader(ctx).load(p.prompt))[p.pick.slot - 1]
						?.teamName ?? null,
			}),
			// The pick he really was. Null when he came in undrafted.
			originalOverall: t.int({
				nullable: true,
				resolve: (p, _args, ctx) =>
					originalPickLoader(ctx).load(
						`${p.prompt.leagueId}|${p.pick.playerId}`,
					),
			}),
			// How many of the public redrafts reaching this slot put him here.
			sharePercent: t.int({
				resolve: async (p, _args, ctx) =>
					sharePercent(
						slotShare(
							await redraftConsensusLoader(ctx).load(p.prompt.id),
							p.pick.slot,
							p.pick.playerId,
						),
					),
			}),
		}),
	})

export const RedraftPostRef = builder.drizzleObject("posts", {
	variant: "RedraftPost",
	interfaces: [PostInterfaceRef],
	fields: (t) => ({
		prompt: t.field({
			type: RedraftPromptRef,
			resolve: async (p, _args, ctx) => {
				const prompt = await promptByIdLoader(ctx).load(p.promptId)
				if (!prompt) throw new Error("Post's prompt missing")
				return prompt
			},
		}),
		// Every slot it fills, first pick first.
		picks: t.field({
			type: [RedraftPickRef],
			resolve: async (p, _args, ctx) => {
				const [prompt, picks] = await Promise.all([
					promptByIdLoader(ctx).load(p.promptId),
					redraftPicksByPostLoader(ctx).load(p.id),
				])
				if (!prompt) throw new Error("Post's prompt missing")
				return picks.map((pick) => ({ pick, prompt }))
			},
		}),
	}),
})

export const PostConnectionRef = builder
	.objectRef<Connection<Post>>("PostConnection")
	.implement({
		fields: (t) => ({
			items: t.field({ type: [PostInterfaceRef], resolve: (c) => c.items }),
			pageInfo: t.field({ type: PageInfoRef, resolve: (c) => c.pageInfo }),
		}),
	})
