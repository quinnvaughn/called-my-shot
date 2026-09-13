import { readFileSync } from "node:fs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
	HOUR,
	makeLeague,
	makeOption,
	makeQuestion,
	makeSeason,
	makeTeam,
} from "../../test/factories"
import { db } from "../index"
import { externalRefs } from "../schema"
import { autoResolveChampionships } from "./auto-resolve-championships"
import {
	type EspnPostseasonEvent,
	fetchPostseasonScoreboard,
} from "./espn-client"

vi.mock("./espn-client", async (importOriginal) => ({
	...(await importOriginal<typeof import("./espn-client")>()),
	fetchPostseasonScoreboard: vi.fn(),
}))

const NOW = new Date("2026-09-12T12:00:00Z")
const DAY = 24 * HOUR
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY)
const run = () => autoResolveChampionships({ now: NOW, spacingMs: 0 })

// See championship.test.ts for where the fixture comes from. OKC ("25") beat
// IND ("11") in the Finals.
const nbaPostseason = () =>
	(
		JSON.parse(
			readFileSync(
				new URL("./fixtures/espn/postseason-nba.json", import.meta.url),
				"utf8",
			),
		) as { events: EspnPostseasonEvent[] }
	).events
const isFinalsGameSeven = (event: EspnPostseasonEvent) =>
	event.competitions[0].notes?.some(
		(note) => note.headline === "NBA Finals - Game 7",
	) ?? false

async function seedFinals(postseason: {
	startsDaysAgo: number
	endsDaysAgo: number
}) {
	const league = await makeLeague({ slug: "nba" })
	const season = await makeSeason({
		leagueId: league.id,
		year: 2025,
		regularSeasonStartsAt: daysAgo(200),
		regularSeasonEndsAt: daysAgo(postseason.startsDaysAgo + 1),
		postseasonStartsAt: daysAgo(postseason.startsDaysAgo),
		postseasonEndsAt: daysAgo(postseason.endsDaysAgo),
	})
	const okc = await makeTeam({ leagueId: league.id })
	const ind = await makeTeam({ leagueId: league.id })
	for (const [team, espnId] of [
		[okc, "25"],
		[ind, "11"],
	] as const) {
		await db.insert(externalRefs).values({
			source: "espn",
			entityType: "team",
			sourceId: `nba:${espnId}`,
			entityId: team.id,
		})
	}
	const question = await makeQuestion({
		shape: "team_season_award",
		leagueId: league.id,
		sportId: league.sportId,
		seasonId: season.id,
		status: "locked",
		locksAt: daysAgo(postseason.startsDaysAgo + 1),
		resolutionMode: "system",
		awardName: "NBA Finals",
		awardVerb: "win",
		picksRequired: 1,
	})
	const okcOption = await makeOption(question.id, {
		label: "OKC",
		sortOrder: 0,
		teamId: okc.id,
	})
	await makeOption(question.id, { label: "IND", sortOrder: 1, teamId: ind.id })
	return { question, okcOption }
}

const questionById = (id: string) =>
	db.query.questions.findFirst({ where: { id } })
const autoRowFor = (questionId: string) =>
	db.query.questionAutoResolutions.findFirst({ where: { questionId } })

beforeEach(() => {
	vi.mocked(fetchPostseasonScoreboard).mockReset()
})

describe("autoResolveChampionships", () => {
	it("resolves a championship from the game that decided it", async () => {
		const { question, okcOption } = await seedFinals({
			startsDaysAgo: 60,
			endsDaysAgo: 10,
		})
		vi.mocked(fetchPostseasonScoreboard).mockResolvedValue(nbaPostseason())

		await run()

		const row = await questionById(question.id)
		expect(row?.status).toBe("resolved")
		expect(row?.resolutionSource).toBe("ESPN postseason results")
		const gameSeven = nbaPostseason().find(isFinalsGameSeven)
		expect(row?.resolutionSourceUrl).toBe(
			`https://www.espn.com/nba/game/_/gameId/${gameSeven?.id}`,
		)
		const correct = (
			await db.query.questionOptions.findMany({
				where: { questionId: question.id },
			})
		)
			.filter((o) => o.isCorrect)
			.map((o) => o.id)
		expect(correct).toEqual([okcOption.id])
	})

	it("doesn't read anything before the postseason starts", async () => {
		await seedFinals({ startsDaysAgo: -5, endsDaysAgo: -60 })
		await run()
		expect(fetchPostseasonScoreboard).not.toHaveBeenCalled()
	})

	it("waits quietly while the deciding series is still going", async () => {
		const { question } = await seedFinals({ startsDaysAgo: 60, endsDaysAgo: 0 })
		vi.mocked(fetchPostseasonScoreboard).mockResolvedValue(
			nbaPostseason().filter((event) => !isFinalsGameSeven(event)),
		)

		await run()

		expect((await questionById(question.id))?.status).toBe("locked")
		expect(await autoRowFor(question.id)).toBeUndefined()
	})

	it("hands the question to an admin when ESPN never shows it decided", async () => {
		const { question } = await seedFinals({
			startsDaysAgo: 60,
			endsDaysAgo: 10,
		})
		vi.mocked(fetchPostseasonScoreboard).mockResolvedValue(
			nbaPostseason().filter((event) => !isFinalsGameSeven(event)),
		)

		await run()

		const auto = await autoRowFor(question.id)
		expect(auto?.failureReason).toBe("box_score_not_final")
		expect(auto?.escalatedAt).not.toBeNull()
	})
})
