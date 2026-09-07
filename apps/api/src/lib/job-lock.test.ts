import { sql } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "../db"
import { jobLocks } from "../db/schema"
import { withJobLock } from "./job-lock"

describe("withJobLock", () => {
	it("runs one of two simultaneous holders and skips the other", async () => {
		let ran = 0
		const results = await Promise.all([
			withJobLock("t", async () => {
				ran += 1
			}),
			withJobLock("t", async () => {
				ran += 1
			}),
		])

		expect(ran).toBe(1)
		expect(results.filter((r) => r.ran)).toHaveLength(1)
	})

	it("frees the lease when the job finishes", async () => {
		await withJobLock("t", async () => {})
		// Released, not merely expired - nothing should be left behind.
		expect(await db.query.jobLocks.findMany()).toEqual([])
		expect((await withJobLock("t", async () => {})).ran).toBe(true)
	})

	// The whole point of a lease over a lock: a holder that dies without
	// releasing must not block the job forever, which is exactly what the
	// advisory-lock version did on a pooled connection.
	it("reclaims a lease whose holder died without releasing it", async () => {
		await db.insert(jobLocks).values({
			name: "t",
			holder: "a-machine-that-is-gone",
			lockedUntil: sql`now() - interval '1 minute'`,
		})

		expect((await withJobLock("t", async () => {})).ran).toBe(true)
	})

	it("does not reclaim a lease that is still live", async () => {
		await db.insert(jobLocks).values({
			name: "t",
			holder: "someone-else",
			lockedUntil: sql`now() + interval '5 minutes'`,
		})

		expect((await withJobLock("t", async () => {})).ran).toBe(false)
	})

	it("releases the lease even when the job throws", async () => {
		await expect(
			withJobLock("t", async () => {
				throw new Error("job blew up")
			}),
		).rejects.toThrow("job blew up")

		expect((await withJobLock("t", async () => {})).ran).toBe(true)
	})

	it("keeps separate jobs independent", async () => {
		let other = 0
		await withJobLock("a", async () => {
			await withJobLock("b", async () => {
				other += 1
			})
		})
		expect(other).toBe(1)
	})

	// A holder whose lease lapsed and was taken by someone else must not be
	// able to delete the new holder's lease on its way out.
	it("will not release a lease another holder now owns", async () => {
		await withJobLock("t", async () => {
			await db
				.update(jobLocks)
				.set({ holder: "someone-else" })
				.where(sql`${jobLocks.name} = 't'`)
		})

		const [row] = await db.query.jobLocks.findMany()
		expect(row?.holder).toBe("someone-else")
	})
})
