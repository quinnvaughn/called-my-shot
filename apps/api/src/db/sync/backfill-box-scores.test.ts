import { readFileSync } from "node:fs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
	HOUR,
	makeGame,
	makeLeague,
	makeSeason,
	makeTeam,
} from "../../test/factories"
import { db } from "../index"
import { externalRefs } from "../schema"
import { backfillBoxScores, selectBackfillGames } from "./backfill-box-scores"
import {
	type EspnGameSummary,
	EspnRequestError,
	fetchGameSummary,
} from "./espn-client"

vi.mock("./espn-client", async (importOriginal) => ({
	...(await importOriginal<typeof import("./espn-client")>()),
	fetchGameSummary: vi.fn(),
}))

const NOW = new Date("2026-09-12T12:00:00Z")
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * HOUR)

const nbaSummary = () =>
	JSON.parse(
		readFileSync(
			new URL("./fixtures/espn/nba-summary.json", import.meta.url),
			"utf8",
		),
	) as EspnGameSummary

async function link(
	entityType: "team" | "player" | "game",
	sourceId: string,
	entityId: string,
) {
	await db
		.insert(externalRefs)
		.values({ source: "espn", entityType, sourceId, entityId })
}

// One synced NBA league whose teams carry the fixture's ESPN ids, so every
// game seeded against it can be captured from the same summary.
async function seedLeague() {
	const league = await makeLeague({ slug: "nba" })
	const home = await makeTeam({ leagueId: league.id })
	const away = await makeTeam({ leagueId: league.id })
	await link("team", "nba:2", home.id)
	await link("team", "nba:3", away.id)
	return { league, home, away }
}

type Seeded = Awaited<ReturnType<typeof seedLeague>>

async function seedFinalGame(
	seeded: Seeded,
	options: {
		startsAt?: Date
		espnEventId?: string | null
		seasonId?: string
		status?: "final" | "scheduled"
		boxScoreSyncedAt?: Date
	} = {},
) {
	const game = await makeGame({
		leagueId: seeded.league.id,
		homeTeamId: seeded.home.id,
		awayTeamId: seeded.away.id,
		startsAt: options.startsAt ?? daysAgo(3),
		status: options.status ?? "final",
		finalizedAt: options.status === "scheduled" ? null : daysAgo(3),
		...(options.seasonId ? { seasonId: options.seasonId } : {}),
		...(options.boxScoreSyncedAt
			? { boxScoreSyncedAt: options.boxScoreSyncedAt }
			: {}),
	})
	if (options.espnEventId !== null) {
		await link("game", `nba:${options.espnEventId ?? game.id}`, game.id)
	}
	return game
}

const run = (candidates: Awaited<ReturnType<typeof selectBackfillGames>>) =>
	backfillBoxScores({
		candidates: candidates.candidates,
		now: NOW,
		spacingMs: 0,
	})

beforeEach(() => {
	vi.mocked(fetchGameSummary).mockReset()
})

describe("selectBackfillGames", () => {
	it("takes final games with no box score, oldest first", async () => {
		const seeded = await seedLeague()
		const older = await seedFinalGame(seeded, { startsAt: daysAgo(9) })
		const newer = await seedFinalGame(seeded, { startsAt: daysAgo(2) })

		const { candidates } = await selectBackfillGames()

		expect(candidates.map((c) => c.game.id)).toEqual([older.id, newer.id])
	})

	it("leaves out games already captured and games not final", async () => {
		const seeded = await seedLeague()
		const pending = await seedFinalGame(seeded)
		await seedFinalGame(seeded, { boxScoreSyncedAt: daysAgo(1) })
		await seedFinalGame(seeded, { status: "scheduled" })

		const { candidates } = await selectBackfillGames()

		expect(candidates.map((c) => c.game.id)).toEqual([pending.id])
	})

	it("counts a game with no ESPN event instead of trying to fetch it", async () => {
		const seeded = await seedLeague()
		const fetchable = await seedFinalGame(seeded)
		await seedFinalGame(seeded, { espnEventId: null })

		const selection = await selectBackfillGames()

		expect(selection.candidates.map((c) => c.game.id)).toEqual([fetchable.id])
		expect(selection.skippedNoEspnRef).toBe(1)
	})

	it("honours the league, date and limit filters", async () => {
		const seeded = await seedLeague()
		await seedFinalGame(seeded, { startsAt: daysAgo(30) })
		const inWindow = await seedFinalGame(seeded, { startsAt: daysAgo(5) })
		await seedFinalGame(seeded, { startsAt: daysAgo(1) })

		const byDate = await selectBackfillGames({
			from: daysAgo(10),
			to: daysAgo(3),
		})
		expect(byDate.candidates.map((c) => c.game.id)).toEqual([inWindow.id])

		const limited = await selectBackfillGames({ limit: 2 })
		expect(limited.candidates).toHaveLength(2)

		const otherLeague = await selectBackfillGames({ leagueSlugs: ["nfl"] })
		expect(otherLeague.candidates).toEqual([])
	})

	it("filters to a season by its year", async () => {
		const seeded = await seedLeague()
		const other = await makeSeason({ leagueId: seeded.league.id, year: 2019 })
		const wanted = await seedFinalGame(seeded)
		await seedFinalGame(seeded, { seasonId: other.id })

		const selection = await selectBackfillGames({ seasonYears: [2019] })

		expect(selection.candidates.map((c) => c.game.id)).not.toContain(wanted.id)
		expect(selection.candidates).toHaveLength(1)
	})
})

describe("backfillBoxScores", () => {
	it("captures and stamps each game", async () => {
		const seeded = await seedLeague()
		await seedFinalGame(seeded, { startsAt: daysAgo(9) })
		await seedFinalGame(seeded, { startsAt: daysAgo(2) })
		vi.mocked(fetchGameSummary).mockResolvedValue(nbaSummary())

		const result = await run(await selectBackfillGames())

		expect(result.captured).toBe(2)
		expect(result.playerRows).toBeGreaterThan(0)
		const remaining = await selectBackfillGames()
		expect(remaining.candidates).toEqual([])
	})

	it("leaves a game unstamped when its box score isn't complete", async () => {
		const seeded = await seedLeague()
		await seedFinalGame(seeded)
		const partial = nbaSummary()
		partial.header.competitions[0].boxscoreSource = "basic"
		vi.mocked(fetchGameSummary).mockResolvedValue(partial)

		const result = await run(await selectBackfillGames())

		expect(result.notFinal).toBe(1)
		expect(result.captured).toBe(0)
		// Still pending, so a later run picks it up once ESPN fills it in.
		expect((await selectBackfillGames()).candidates).toHaveLength(1)
	})

	it("stops on a refusal and resumes where it left off", async () => {
		const seeded = await seedLeague()
		const first = await seedFinalGame(seeded, { startsAt: daysAgo(9) })
		const second = await seedFinalGame(seeded, { startsAt: daysAgo(6) })
		const third = await seedFinalGame(seeded, { startsAt: daysAgo(2) })

		vi.mocked(fetchGameSummary)
			.mockResolvedValueOnce(nbaSummary())
			.mockResolvedValueOnce(nbaSummary())
			.mockRejectedValueOnce(new EspnRequestError("refused", 429))

		const stopped = await run(await selectBackfillGames())

		expect(stopped.refusedAfter).toBe(2)
		expect(stopped.captured).toBe(2)

		// The two that landed are stamped; only the third is still pending.
		const pending = await selectBackfillGames()
		expect(pending.candidates.map((c) => c.game.id)).toEqual([third.id])

		vi.mocked(fetchGameSummary).mockResolvedValue(nbaSummary())
		const resumed = await run(pending)

		expect(resumed.captured).toBe(1)
		expect(resumed.refusedAfter).toBeNull()
		for (const id of [first.id, second.id, third.id]) {
			const game = await db.query.games.findFirst({ where: { id } })
			expect(game?.boxScoreSyncedAt).not.toBeNull()
		}
	})
})
