import { describe, expect, it } from "vitest"
import { buildAdminConnection, clampAdminPageSize } from "./admin-pagination"
import { ValidationError } from "./errors"
import {
	clampPageSize,
	cursorWhere,
	decodeCursor,
	decodeOffsetCursor,
	encodeCursor,
	encodeOffsetCursor,
	paginate,
	sliceOffsetPage,
} from "./pagination"

const row = (iso: string, id: string) => ({ createdAt: new Date(iso), id })

describe("clampPageSize", () => {
	it("defaults when nothing is asked for", () => {
		expect(clampPageSize(null)).toBe(10)
		expect(clampPageSize(undefined)).toBe(10)
	})

	it("clamps to 1..50", () => {
		expect(clampPageSize(0)).toBe(1)
		expect(clampPageSize(-5)).toBe(1)
		expect(clampPageSize(25)).toBe(25)
		expect(clampPageSize(1000)).toBe(50)
	})
})

describe("keyset cursors", () => {
	it("round-trips a timestamp and id", () => {
		const createdAt = new Date("2026-03-03T12:00:00.000Z")
		const decoded = decodeCursor(encodeCursor(createdAt, "abc"))
		expect(decoded.createdAt.toISOString()).toBe(createdAt.toISOString())
		expect(decoded.id).toBe("abc")
	})

	it("is URL-safe base64 - no +, / or = to escape", () => {
		const cursor = encodeCursor(new Date("2026-03-03T12:00:00.000Z"), "a/b+c")
		expect(cursor).not.toMatch(/[+/=]/)
	})

	it("rejects a malformed cursor as a field error, not a crash", () => {
		expect(() => decodeCursor("not-base64!!")).toThrow(ValidationError)
		expect(() =>
			decodeCursor(Buffer.from("no-pipe").toString("base64url")),
		).toThrow(ValidationError)
		expect(() =>
			decodeCursor(Buffer.from("not-a-date|abc").toString("base64url")),
		).toThrow(ValidationError)
	})

	it("names the offending argument on the error", () => {
		try {
			decodeCursor("garbage")
			throw new Error("should have thrown")
		} catch (error) {
			expect(error).toBeInstanceOf(ValidationError)
			expect((error as ValidationError).fieldErrors[0].field).toBe("after")
		}
	})

	it("builds a strictly-before filter with an id tiebreaker", () => {
		const createdAt = new Date("2026-03-03T12:00:00.000Z")
		expect(cursorWhere({ createdAt, id: "abc" })).toEqual({
			OR: [
				{ createdAt: { lt: createdAt } },
				{ createdAt: { eq: createdAt }, id: { lt: "abc" } },
			],
		})
	})
})

describe("paginate", () => {
	const rows = [
		row("2026-03-03T12:00:00.000Z", "c"),
		row("2026-03-02T12:00:00.000Z", "b"),
		row("2026-03-01T12:00:00.000Z", "a"),
	]

	it("trims the lookahead row and reports another page", () => {
		const page = paginate(rows, 2)
		expect(page.items.map((r) => r.id)).toEqual(["c", "b"])
		expect(page.pageInfo.hasNextPage).toBe(true)
	})

	it("reports no next page when the lookahead came back short", () => {
		const page = paginate(rows, 5)
		expect(page.items).toHaveLength(3)
		expect(page.pageInfo.hasNextPage).toBe(false)
	})

	it("points the end cursor at the last returned row, not the lookahead", () => {
		const page = paginate(rows, 2)
		expect(page.pageInfo.endCursor).toBe(
			encodeCursor(rows[1].createdAt, rows[1].id),
		)
	})

	it("returns a null cursor for an empty page", () => {
		const page = paginate([], 10)
		expect(page.items).toEqual([])
		expect(page.pageInfo).toEqual({ hasNextPage: false, endCursor: null })
	})
})

describe("offset cursors", () => {
	it("round-trips an offset", () => {
		expect(decodeOffsetCursor(encodeOffsetCursor(0))).toBe(0)
		expect(decodeOffsetCursor(encodeOffsetCursor(120))).toBe(120)
	})

	it("rejects a negative or non-integer offset", () => {
		expect(() =>
			decodeOffsetCursor(Buffer.from("-1").toString("base64url")),
		).toThrow(ValidationError)
		expect(() =>
			decodeOffsetCursor(Buffer.from("1.5").toString("base64url")),
		).toThrow(ValidationError)
		expect(() =>
			decodeOffsetCursor(Buffer.from("abc").toString("base64url")),
		).toThrow(ValidationError)
	})
})

describe("admin pagination", () => {
	it("defaults higher than the public feed and caps at 100", () => {
		expect(clampAdminPageSize(null)).toBe(100)
		expect(clampAdminPageSize(undefined)).toBe(100)
		expect(clampAdminPageSize(250)).toBe(100)
		expect(clampAdminPageSize(0)).toBe(1)
		expect(clampAdminPageSize(30)).toBe(30)
	})

	it("advances the cursor by the number of rows actually returned", () => {
		const rows = [1, 2, 3, 4, 5, 6]
		const page = buildAdminConnection(rows, 5, 10)
		expect(page.items).toHaveLength(5)
		expect(page.pageInfo.hasNextPage).toBe(true)
		expect(decodeOffsetCursor(page.pageInfo.endCursor as string)).toBe(15)
	})

	it("returns a null cursor when the page is empty", () => {
		const page = buildAdminConnection([], 5, 0)
		expect(page.pageInfo).toEqual({ hasNextPage: false, endCursor: null })
	})
})

describe("sliceOffsetPage", () => {
	const ranked = Array.from({ length: 25 }, (_, i) => i + 1)

	it("walks an in-memory list page by page", () => {
		const first = sliceOffsetPage(ranked, { first: 10 })
		expect(first.items).toEqual(ranked.slice(0, 10))
		expect(first.pageInfo.hasNextPage).toBe(true)

		const last = sliceOffsetPage(ranked, {
			first: 10,
			after: sliceOffsetPage(ranked, {
				first: 10,
				after: first.pageInfo.endCursor,
			}).pageInfo.endCursor,
		})
		expect(last.items).toEqual(ranked.slice(20))
		expect(last.pageInfo.hasNextPage).toBe(false)
	})

	it("returns a null cursor past the end", () => {
		const page = sliceOffsetPage(ranked, {
			after: encodeOffsetCursor(ranked.length),
		})
		expect(page).toEqual({
			items: [],
			pageInfo: { hasNextPage: false, endCursor: null },
		})
	})
})
