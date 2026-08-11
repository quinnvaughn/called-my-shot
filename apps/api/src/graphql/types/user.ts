import { db } from "../../db"
import { builder } from "../builder"

export const UserRef = builder.drizzleObject("users", {
	name: "User",
	fields: (t) => ({
		id: t.exposeID("id"),
		name: t.exposeString("name"),
		username: t.exposeString("username"),
		email: t.exposeString("email"),
		createdAt: t.field({
			type: "String",
			resolve: (user) => user.createdAt.toISOString(),
		}),
	}),
})

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
}))
