import { builder } from "../builder";

export const UserRef = builder.drizzleObject("users", {
	name: "User",
	fields: (t) => ({
		id: t.exposeID("id"),
		email: t.exposeString("email"),
		createdAt: t.field({
			type: "String",
			resolve: (user) => user.createdAt.toISOString(),
		}),
	}),
});
