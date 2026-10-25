import { db } from "../../../db"
import type {
	FollowTargetKind,
	League,
	Player,
	Team,
	User,
} from "../../../db/schema"
import { requireUser } from "../../../lib/auth"
import {
	AuthenticationError,
	AuthorizationError,
	NotFoundError,
} from "../../../lib/errors"
import { follow, unfollow } from "../../../lib/follows/follow"
import { imageUrl } from "../../../lib/storage"
import { isUuid } from "../../../lib/uuid"
import { builder } from "../../builder"
import { LeagueRef, PlayerRef, TeamRef } from "../sports"
import { UserRef } from "../user"
import {
	followerCountLoader,
	followingCountLoader,
	followKey,
	viewerFollowsLoader,
} from "./loaders"

// Following leagues, teams, players and people: the follow and unfollow
// mutations, whether the viewer follows something, follower counts, and
// everything the viewer follows for the rail and the follow pickers.
// Importing this file is what pulls them into the schema (see
// graphql/schema.ts).

export const FollowTargetKindEnum = builder.enumType("FollowTargetKind", {
	values: {
		USER: { value: "user" },
		LEAGUE: { value: "league" },
		TEAM: { value: "team" },
		PLAYER: { value: "player" },
	} as const,
})

builder.objectFields(LeagueRef, (t) => ({
	viewerFollows: t.boolean({
		resolve: (row, _args, ctx) =>
			viewerFollowsLoader(ctx).load(followKey("league", row.id)),
	}),
}))
builder.objectFields(TeamRef, (t) => ({
	viewerFollows: t.boolean({
		resolve: (row, _args, ctx) =>
			viewerFollowsLoader(ctx).load(followKey("team", row.id)),
	}),
}))
builder.objectFields(PlayerRef, (t) => ({
	viewerFollows: t.boolean({
		resolve: (row, _args, ctx) =>
			viewerFollowsLoader(ctx).load(followKey("player", row.id)),
	}),
	// The player's square head-and-shoulders portrait for Rushmore art. Null
	// until the portrait pipeline has built one (see lib/portraits), or when
	// no photo of them could be found; the art shows their initials instead.
	portraitUrl: t.string({
		nullable: true,
		resolve: (player) => imageUrl(player.portraitKey),
	}),
}))
builder.objectFields(UserRef, (t) => ({
	viewerFollows: t.boolean({
		resolve: (row, _args, ctx) =>
			viewerFollowsLoader(ctx).load(followKey("user", row.id)),
	}),
	followerCount: t.int({
		resolve: (user, _args, ctx) => followerCountLoader(ctx).load(user.id),
	}),
	// People this user follows. Leagues, teams and players aren't counted.
	followingCount: t.int({
		resolve: (user, _args, ctx) => followingCountLoader(ctx).load(user.id),
	}),
}))

type MyFollows = {
	leagues: League[]
	teams: Team[]
	players: Player[]
	users: User[]
}

const MyFollowsRef = builder.objectRef<MyFollows>("MyFollows").implement({
	fields: (t) => ({
		leagues: t.field({ type: [LeagueRef], resolve: (f) => f.leagues }),
		teams: t.field({ type: [TeamRef], resolve: (f) => f.teams }),
		players: t.field({ type: [PlayerRef], resolve: (f) => f.players }),
		users: t.field({ type: [UserRef], resolve: (f) => f.users }),
	}),
})

// What a follow or unfollow touched, so the client can update the button
// it came from. Only the field matching kind is set.
type FollowResult = {
	following: boolean
	kind: FollowTargetKind
	targetId: string
}

const FollowPayload = builder
	.objectRef<FollowResult>("FollowPayload")
	.implement({
		fields: (t) => ({
			following: t.boolean({ resolve: (p) => p.following }),
			kind: t.field({ type: FollowTargetKindEnum, resolve: (p) => p.kind }),
			targetId: t.id({ resolve: (p) => p.targetId }),
			league: t.field({
				type: LeagueRef,
				nullable: true,
				resolve: async (p) =>
					p.kind === "league"
						? ((await db.query.leagues.findFirst({
								where: { id: p.targetId },
							})) ?? null)
						: null,
			}),
			team: t.field({
				type: TeamRef,
				nullable: true,
				resolve: async (p) =>
					p.kind === "team"
						? ((await db.query.teams.findFirst({
								where: { id: p.targetId },
							})) ?? null)
						: null,
			}),
			player: t.field({
				type: PlayerRef,
				nullable: true,
				resolve: async (p) =>
					p.kind === "player"
						? ((await db.query.players.findFirst({
								where: { id: p.targetId },
							})) ?? null)
						: null,
			}),
			user: t.field({
				type: UserRef,
				nullable: true,
				resolve: async (p) =>
					p.kind === "user"
						? ((await db.query.users.findFirst({
								where: { id: p.targetId },
							})) ?? null)
						: null,
			}),
		}),
	})

builder.queryFields((t) => ({
	// Everything the signed-in viewer follows, oldest follow first. Empty
	// signed out.
	myFollows: t.field({
		type: MyFollowsRef,
		resolve: async (_root, _args, ctx) => {
			const empty = { leagues: [], teams: [], players: [], users: [] }
			if (!ctx.user) return empty
			const rows = await db.query.follows.findMany({
				where: { followerId: ctx.user.id },
				orderBy: { createdAt: "asc" },
			})
			const idsOf = (kind: FollowTargetKind) =>
				rows.filter((row) => row.targetKind === kind).map((row) => row.targetId)
			const inOrder = <T extends { id: string }>(ids: string[], found: T[]) => {
				const byId = new Map(found.map((row) => [row.id, row]))
				return ids.flatMap((id) => {
					const row = byId.get(id)
					return row ? [row] : []
				})
			}
			const [leagueIds, teamIds, playerIds, userIds] = [
				idsOf("league"),
				idsOf("team"),
				idsOf("player"),
				idsOf("user"),
			]
			const [leagues, teams, players, users] = await Promise.all([
				db.query.leagues.findMany({ where: { id: { in: leagueIds } } }),
				db.query.teams.findMany({ where: { id: { in: teamIds } } }),
				db.query.players.findMany({ where: { id: { in: playerIds } } }),
				db.query.users.findMany({ where: { id: { in: userIds } } }),
			])
			return {
				leagues: inOrder(leagueIds, leagues),
				teams: inOrder(teamIds, teams),
				players: inOrder(playerIds, players),
				users: inOrder(userIds, users),
			}
		},
	}),
}))

const errors = (name: string) => ({
	types: [AuthenticationError, AuthorizationError, NotFoundError],
	directResult: true as const,
	union: { name },
})

builder.mutationFields((t) => ({
	follow: t.field({
		type: FollowPayload,
		errors: errors("FollowResult"),
		args: {
			kind: t.arg({ type: FollowTargetKindEnum, required: true }),
			id: t.arg.id({ required: true }),
		},
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const targetId = String(args.id)
			if (!isUuid(targetId)) throw new NotFoundError()
			await follow(user, args.kind, targetId)
			return { following: true, kind: args.kind, targetId }
		},
	}),

	unfollow: t.field({
		type: FollowPayload,
		errors: errors("UnfollowResult"),
		args: {
			kind: t.arg({ type: FollowTargetKindEnum, required: true }),
			id: t.arg.id({ required: true }),
		},
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const targetId = String(args.id)
			if (!isUuid(targetId)) throw new NotFoundError()
			await unfollow(user, args.kind, targetId)
			return { following: false, kind: args.kind, targetId }
		},
	}),
}))
