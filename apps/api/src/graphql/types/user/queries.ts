import { usernameSchema } from "@called-my-shot/schemas"
import { db } from "../../../db"
import { SortDirection } from "../../../lib/admin-pagination"
import { requireAdmin, requireUser } from "../../../lib/auth"
import { AuthenticationError, AuthorizationError } from "../../../lib/errors"
import { builder } from "../../builder"
import { AdminUserSort } from "./enums"
import { QuestionVoidRef, UserRef } from "./refs"

builder.queryFields((t) => ({
	me: t.field({
		type: UserRef,
		nullable: true,
		resolve: (_root, _args, ctx) => ctx.user,
	}),
	user: t.drizzleField({
		type: "users",
		nullable: true,
		args: {
			id: t.arg.id({ required: true }),
		},
		resolve: (query, _root, args) =>
			db.query.users.findFirst(query({ where: { id: args.id } })),
	}),
	userByUsername: t.drizzleField({
		type: "users",
		nullable: true,
		args: {
			username: t.arg.string({ required: true }),
		},
		resolve: (query, _root, args) =>
			db.query.users.findFirst(query({ where: { username: args.username } })),
	}),
	usernameAvailable: t.boolean({
		args: {
			username: t.arg.string({ required: true }),
		},
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const parsed = usernameSchema.safeParse(args.username)
			if (!parsed.success) return false
			const existing = await db.query.users.findFirst({
				where: { username: parsed.data },
			})
			return !existing || existing.id === user.id
		},
	}),

	// Users tab - plain list + optional search, no cursor pagination, same
	// "admin tool stays light" reasoning as adminGames in sports.ts. Sort is a
	// real column only - Points isn't included since it's a derived value
	// (buildGlobalLeaderboard, computed per-row by UserRef.careerStats below)
	// with no stored column to order by cheaply across the whole table.
	adminUsers: t.field({
		type: [UserRef],
		errors: { types: [AuthenticationError, AuthorizationError] },
		args: {
			search: t.arg.string({ required: false }),
			sortBy: t.arg({ type: AdminUserSort, required: false }),
			sortDir: t.arg({ type: SortDirection, required: false }),
		},
		resolve: (_root, args, ctx) => {
			requireAdmin(ctx)
			const search = args.search?.trim()
			const sortBy = args.sortBy ?? "username"
			const sortDir = args.sortDir ?? "asc"
			return db.query.users.findMany({
				where: search
					? {
							OR: [
								{ name: { ilike: `%${search}%` } },
								{ username: { ilike: `%${search}%` } },
							],
						}
					: undefined,
				orderBy: { [sortBy]: sortDir },
			})
		},
	}),

	adminUserVoidHistory: t.field({
		type: [QuestionVoidRef],
		errors: { types: [AuthenticationError, AuthorizationError] },
		args: { userId: t.arg.id({ required: true }) },
		resolve: (_root, args, ctx) => {
			requireAdmin(ctx)
			return db.query.questionVoids.findMany({
				where: { targetUserId: args.userId },
				orderBy: { createdAt: "desc" },
			})
		},
	}),
}))
