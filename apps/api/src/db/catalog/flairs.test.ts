import { STREAK_FLAIR_THRESHOLDS } from "@called-my-shot/scoring"
import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { makeLeague, makeTeam } from "../../test/factories"
import { db } from "../index"
import { flairs } from "../schema"
import { ACHIEVEMENT_FLAIRS, syncFlairCatalog } from "./flairs"

describe("ACHIEVEMENT_FLAIRS", () => {
	it("has unique keys", () => {
		const keys = ACHIEVEMENT_FLAIRS.map((flair) => flair.key)
		expect(new Set(keys).size).toBe(keys.length)
	})

	// Every one of these renders as a chip with no team behind it, so each
	// has to supply its own display fields - a null here is a "?" on someone's
	// profile.
	it("every entry carries its own display fields", () => {
		for (const flair of ACHIEVEMENT_FLAIRS) {
			expect(flair.icon, flair.key).toBeTruthy()
			expect(flair.label, flair.key).toBeTruthy()
			expect(flair.description, flair.key).toBeTruthy()
			expect(flair.color, flair.key).toMatch(/^#[0-9A-F]{6}$/i)
		}
	})

	// The chip renders the icon at 2xs in a mono face. Past four characters it
	// stops being an icon and starts wrapping the row.
	it("icons stay short enough to render as an icon", () => {
		for (const flair of ACHIEVEMENT_FLAIRS) {
			expect(flair.icon.length, flair.key).toBeLessThanOrEqual(4)
		}
	})

	it("covers exactly the streak thresholds scoring defines", () => {
		const streakKeys = ACHIEVEMENT_FLAIRS.filter((flair) =>
			flair.key.startsWith("streak:"),
		).map((flair) => flair.key)
		expect(streakKeys).toEqual(
			STREAK_FLAIR_THRESHOLDS.map((length) => `streak:${length}`),
		)
	})
})

describe("syncFlairCatalog", () => {
	it("gives every team a flair that points at it and copies nothing", async () => {
		const league = await makeLeague({ slug: "nba" })
		const team = await makeTeam({
			leagueId: league.id,
			abbreviation: "BOS",
			name: "Boston Celtics",
		})

		await syncFlairCatalog()

		const flair = await db.query.flairs.findFirst({
			where: { teamId: team.id },
		})
		expect(flair?.key).toBe("team:nba:bos")
		expect(flair?.source).toBe("team")
		expect(flair?.unlock).toBe("open")
		// The display columns stay null - they're read off the team at query
		// time, which is what keeps a rebrand from needing a catalog re-run.
		expect(flair?.label).toBeNull()
		expect(flair?.color).toBeNull()
		expect(flair?.icon).toBeNull()
	})

	it("is idempotent", async () => {
		const league = await makeLeague({ slug: "nba" })
		await makeTeam({ leagueId: league.id, abbreviation: "BOS" })

		const first = await syncFlairCatalog()
		const second = await syncFlairCatalog()

		expect(second).toEqual(first)
		const rows = await db.select().from(flairs)
		expect(rows).toHaveLength(1 + ACHIEVEMENT_FLAIRS.length)
	})

	// A flair retired by hand and then re-synced comes back, which is what
	// makes the sync the source of truth rather than a one-time seed.
	it("un-retires a team flair whose team is still around", async () => {
		const league = await makeLeague({ slug: "nba" })
		const team = await makeTeam({ leagueId: league.id, abbreviation: "BOS" })
		await syncFlairCatalog()
		await db
			.update(flairs)
			.set({ status: "retired" })
			.where(eq(flairs.teamId, team.id))

		await syncFlairCatalog()

		const flair = await db.query.flairs.findFirst({
			where: { teamId: team.id },
		})
		expect(flair?.status).toBe("active")
	})
})
