import { describe, expect, it } from "vitest"
import { db } from "../../db"
import { userFlairs } from "../../db/schema"
import { makeFlair, makeUser } from "../../test/factories"
import { grantFlairByKey } from "./grant"

describe("grantFlairByKey", () => {
	it("grants once and reports that it did", async () => {
		const user = await makeUser()
		const flair = await makeFlair({ key: "streak:10" })

		const granted = await db.transaction((tx) =>
			grantFlairByKey(tx, user.id, "streak:10"),
		)

		expect(granted).toBe(true)
		const rows = await db.select().from(userFlairs)
		expect(rows).toHaveLength(1)
		expect(rows[0]?.flairId).toBe(flair.id)
	})

	// The recompute pipeline rebuilds a track from scratch every time one of
	// its questions settles, so it re-detects the same run over and over. Only
	// the first detection may write.
	it("is a no-op the second time, and leaves one row", async () => {
		const user = await makeUser()
		await makeFlair({ key: "streak:10" })

		await db.transaction((tx) => grantFlairByKey(tx, user.id, "streak:10"))
		const again = await db.transaction((tx) =>
			grantFlairByKey(tx, user.id, "streak:10"),
		)

		expect(again).toBe(false)
		const rows = await db.select().from(userFlairs)
		expect(rows).toHaveLength(1)
	})

	// This runs inside the transaction that settles a question. A catalog
	// entry that hasn't synced yet must not be able to fail a resolution.
	it("returns false for an unknown key rather than throwing", async () => {
		const user = await makeUser()

		const granted = await db.transaction((tx) =>
			grantFlairByKey(tx, user.id, "streak:nope"),
		)

		expect(granted).toBe(false)
	})
})
