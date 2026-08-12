import { builder } from "../builder"

export const PageInfoRef = builder
	.objectRef<{ hasNextPage: boolean; endCursor: string | null }>("PageInfo")
	.implement({
		fields: (t) => ({
			hasNextPage: t.exposeBoolean("hasNextPage"),
			endCursor: t.exposeString("endCursor", { nullable: true }),
		}),
	})
