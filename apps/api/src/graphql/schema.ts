import { db } from "../db"
import { builder } from "./builder"
import "./types/auth"
import { UserRef } from "./types/user"

builder.queryType({
	fields: (t) => ({
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
	}),
})

export const schema = builder.toSchema()
