import { builder } from "../builder"

// The shape every *Connection objectRef in this directory is built over - a
// page of rows plus the cursor state for the next one. Structural, not a
// GraphQL type of its own: each domain still declares its own named
// connection (QuestionConnection, CallConnection, ...) over this.
export type Connection<T> = {
	items: T[]
	pageInfo: { hasNextPage: boolean; endCursor: string | null }
	// How many rows match the query in total, not just on this page. Optional
	// because it costs a second count query, so only the connections whose
	// callers actually show a total bother computing it (My Questions prints
	// one under its header); every other connection leaves it unset and its
	// GraphQL field resolves to null.
	totalCount?: number
}

export const PageInfoRef = builder
	.objectRef<{ hasNextPage: boolean; endCursor: string | null }>("PageInfo")
	.implement({
		fields: (t) => ({
			hasNextPage: t.exposeBoolean("hasNextPage"),
			endCursor: t.exposeString("endCursor", { nullable: true }),
		}),
	})
