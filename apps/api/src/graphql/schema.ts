import { db } from "../db";
import { builder } from "./builder";
import "./types/user";

builder.queryType({
	fields: (t) => ({
		users: t.drizzleField({
			type: ["users"],
			resolve: (query) => db.query.users.findMany(query({})),
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
});

export const schema = builder.toSchema();
