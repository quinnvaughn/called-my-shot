import { ValidationError } from "./errors"

// Keyset pagination on (createdAt, id) - stable while new rows land at the
// top of a feed, unlike offset pagination which reshuffles/duplicates rows
// as that happens. id is just a tiebreaker for rows sharing a createdAt
// timestamp, so it doesn't need to be temporally meaningful.
export type Cursor = { createdAt: Date; id: string }

const DEFAULT_PAGE_SIZE = 10
const MAX_PAGE_SIZE = 50

export function clampPageSize(first: number | null | undefined): number {
	if (first === null || first === undefined) return DEFAULT_PAGE_SIZE
	return Math.max(1, Math.min(first, MAX_PAGE_SIZE))
}

export function encodeCursor(createdAt: Date, id: string): string {
	return Buffer.from(`${createdAt.toISOString()}|${id}`).toString("base64url")
}

export function decodeCursor(cursor: string): Cursor {
	const [iso, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|")
	const createdAt = iso ? new Date(iso) : null
	if (!id || !createdAt || Number.isNaN(createdAt.getTime())) {
		throw ValidationError.field("after", "Invalid pagination cursor")
	}
	return { createdAt, id }
}

// Keyset "strictly before" filter for a Drizzle RQBv2 `where` object, ANDed
// in alongside whatever other filters the caller already has on that column
// set (creator/member scoping, etc).
export function cursorWhere(cursor: Cursor) {
	return {
		OR: [
			{ createdAt: { lt: cursor.createdAt } },
			{ createdAt: { eq: cursor.createdAt }, id: { lt: cursor.id } },
		],
	}
}

// Callers fetch `limit + 1` rows ordered by createdAt desc, id desc, then
// hand the result here to trim back to `limit` and derive pageInfo.
export function paginate<T extends { createdAt: Date; id: string }>(
	rows: T[],
	limit: number,
): {
	items: T[]
	pageInfo: { hasNextPage: boolean; endCursor: string | null }
} {
	const hasNextPage = rows.length > limit
	const items = rows.slice(0, limit)
	const last = items[items.length - 1]
	return {
		items,
		pageInfo: {
			hasNextPage,
			endCursor: last ? encodeCursor(last.createdAt, last.id) : null,
		},
	}
}

// Offset-based cursor for connections whose ordering isn't over a stable
// keyset column - a fully-recomputed-per-call ranking (leaderboards) or a
// live aggregate (most-called sort). Just the number of rows already returned, not
// tied to any particular row's identity, so it can't use cursorWhere above.
export function encodeOffsetCursor(offset: number): string {
	return Buffer.from(String(offset)).toString("base64url")
}

export function decodeOffsetCursor(cursor: string): number {
	const offset = Number(Buffer.from(cursor, "base64url").toString("utf8"))
	if (!Number.isInteger(offset) || offset < 0) {
		throw ValidationError.field("after", "Invalid pagination cursor")
	}
	return offset
}

export type PageArgs = { first?: number | null; after?: string | null }

// What a keyset-paginated read hands Drizzle: spread `where` into the query's
// own filters and pass orderBy/limit through untouched.
export type KeysetPage = {
	where: ReturnType<typeof cursorWhere> | Record<string, never>
	orderBy: { createdAt: "desc"; id: "desc" }
	limit: number
}

// One page of a (createdAt, id) keyset feed: clamps the page size, decodes
// the cursor, runs `fetch` for limit + 1 rows, and trims the result.
export async function keysetPaginate<T extends { createdAt: Date; id: string }>(
	args: PageArgs,
	fetch: (page: KeysetPage) => Promise<T[]>,
) {
	const limit = clampPageSize(args.first)
	const cursor = args.after ? decodeCursor(args.after) : null
	const rows = await fetch({
		where: cursor ? cursorWhere(cursor) : {},
		orderBy: { createdAt: "desc", id: "desc" },
		limit: limit + 1,
	})
	return paginate(rows, limit)
}

// One page of a list already ranked in memory (a leaderboard), addressed by
// offset cursor.
export function sliceOffsetPage<T>(
	all: T[],
	args: PageArgs,
): {
	items: T[]
	pageInfo: { hasNextPage: boolean; endCursor: string | null }
} {
	const limit = clampPageSize(args.first)
	const offset = args.after ? decodeOffsetCursor(args.after) : 0
	const items = all.slice(offset, offset + limit)
	return {
		items,
		pageInfo: {
			hasNextPage: offset + limit < all.length,
			endCursor:
				items.length > 0 ? encodeOffsetCursor(offset + items.length) : null,
		},
	}
}

// One page of a ranking the database orders (most-liked first), addressed by
// offset cursor like sliceOffsetPage but without loading every row: `fetch`
// gets the offset and limit + 1, and the extra row says whether there's more.
export async function offsetPaginate<T>(
	args: PageArgs,
	fetch: (page: { offset: number; limit: number }) => Promise<T[]>,
): Promise<{
	items: T[]
	pageInfo: { hasNextPage: boolean; endCursor: string | null }
}> {
	const limit = clampPageSize(args.first)
	const offset = args.after ? decodeOffsetCursor(args.after) : 0
	const rows = await fetch({ offset, limit: limit + 1 })
	const items = rows.slice(0, limit)
	return {
		items,
		pageInfo: {
			hasNextPage: rows.length > limit,
			endCursor:
				items.length > 0 ? encodeOffsetCursor(offset + items.length) : null,
		},
	}
}
