import { type AnyColumn, asc, desc } from "drizzle-orm"
import { builder } from "../graphql/builder"
import { encodeOffsetCursor } from "./pagination"

// Shared by every admin list query (Data tab's leagues/teams/players/games,
// plus the Questions/Users tabs) - offset-based cursor, not the keyset
// (createdAt, id) pagination question.ts's public feed uses elsewhere. Some
// of these tables (leagues/teams/players/games) have no createdAt column at
// all, and even where one exists, these are low-write-rate admin catalogs
// scanned in bulk, so offset's "reshuffles on insert" downside is a non-issue.
export const SortDirection = builder.enumType("SortDirection", {
	values: { ASC: { value: "asc" }, DESC: { value: "desc" } },
})

// No caller asks for more than 100 at once - a deliberately higher ceiling
// than lib/pagination's clampPageSize (50), since these are admin tables
// meant to be scanned in bulk, not a social feed page.
export function clampAdminPageSize(first: number | null | undefined): number {
	if (first == null) return 100
	return Math.max(1, Math.min(first, 100))
}

export type AdminConnection<T> = {
	items: T[]
	pageInfo: { hasNextPage: boolean; endCursor: string | null }
}

// Callers fetch `limit + 1` rows (ordered, offset already applied) and hand
// them here to trim back to `limit` and derive pageInfo - the offset-cursor
// analog of lib/pagination's paginate() for a keyset cursor.
export function buildAdminConnection<T>(
	rows: T[],
	limit: number,
	offset: number,
): AdminConnection<T> {
	const hasNextPage = rows.length > limit
	const items = rows.slice(0, limit)
	return {
		items,
		pageInfo: {
			hasNextPage,
			endCursor:
				items.length > 0 ? encodeOffsetCursor(offset + items.length) : null,
		},
	}
}

export function sortColumn(sortDir: "asc" | "desc", column: AnyColumn) {
	return sortDir === "asc" ? asc(column) : desc(column)
}
