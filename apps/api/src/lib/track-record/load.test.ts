import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"
import { db } from "../../db"
import {
	callSelections,
	type Question,
	type QuestionOption,
	questionOptions,
} from "../../db/schema"
import {
	type League,
	makeCall,
	makeGame,
	makeLeague,
	makeOption,
	makeQuestion,
	makeSelection,
	makeStat,
	makeTeam,
	makeUser,
} from "../../test/factories"
import { loadTrackRecord, type TrackRecordRow } from "./load"

const rowLabeled = (rows: TrackRecordRow[] | null, label: string | null) =>
	rows?.find((row) => row.label === label)?.sides ?? []

let league: League
let statId: string
let teamId: string
let userId: string

beforeEach(async () => {
	league = await makeLeague()
	statId = (await makeStat({ sportId: league.sportId })).id
	teamId = (await makeTeam({ leagueId: league.id })).id
	userId = (await makeUser()).id
})

/** Settles `picked` as a hit or miss for `callerId`, points on the selection. */
async function settle(
	picked: QuestionOption,
	hit: boolean,
	callerId: string = userId,
) {
	await db
		.update(questionOptions)
		.set({ isCorrect: hit })
		.where(eq(questionOptions.id, picked.id))
	const call = await makeCall(picked.questionId, callerId)
	await makeSelection(call.id, picked.id, 50)
	await db
		.update(callSelections)
		.set({ resultPoints: hit ? 50 : -40 })
		.where(eq(callSelections.callId, call.id))
}

function overUnder(overrides: Partial<Question> = {}) {
	return makeQuestion({
		leagueId: league.id,
		shape: "team_stat_over_under",
		statId,
		subjectTeamId: teamId,
		ouLine: 24.5,
		status: "resolved",
		...overrides,
	})
}

/** One settled over/under by `userId` (or `callerId`) on the side given. */
async function overUnderCall(opts: {
	side: "Over" | "Under"
	hit: boolean
	statId?: string
	subjectTeamId?: string
	status?: "open" | "resolved"
	callerId?: string
}): Promise<Question> {
	const question = await overUnder({
		...(opts.statId ? { statId: opts.statId } : {}),
		...(opts.subjectTeamId ? { subjectTeamId: opts.subjectTeamId } : {}),
		status: opts.status ?? "resolved",
	})
	const over = await makeOption(question.id, { label: "Over", sortOrder: 0 })
	const under = await makeOption(question.id, { label: "Under", sortOrder: 1 })
	await settle(opts.side === "Over" ? over : under, opts.hit, opts.callerId)
	return question
}

/** The question being viewed, with its two options. */
async function current(
	overrides: Partial<Question>,
	labels: { label: string; teamId?: string }[],
) {
	const question = await makeQuestion({ leagueId: league.id, ...overrides })
	for (const [sortOrder, option] of labels.entries()) {
		await makeOption(question.id, { ...option, sortOrder })
	}
	return question
}

const currentOverUnder = () =>
	current(
		{ shape: "team_stat_over_under", statId, subjectTeamId: teamId },
		[{ label: "Over" }, { label: "Under" }],
	)

describe("loadTrackRecord", () => {
	it("returns null for a question without exactly two options", async () => {
		const question = await current({ shape: "team_season_award" }, [
			{ label: "A" },
			{ label: "B" },
			{ label: "C" },
		])
		expect(await loadTrackRecord(userId, question, null)).toBeNull()
	})

	it("reads points off the selection, not the call column", async () => {
		await overUnderCall({ side: "Over", hit: true })
		await overUnderCall({ side: "Over", hit: false })
		await overUnderCall({ side: "Over", hit: false })
		const record = await loadTrackRecord(userId, await currentOverUnder(), null)
		expect(rowLabeled(record, null)).toEqual([
			{ label: "Over", wins: 1, losses: 2, netPoints: -30 },
		])
	})

	it("counts other subjects toward all calls but not the subject", async () => {
		const otherTeam = (await makeTeam({ leagueId: league.id })).id
		for (let i = 0; i < 3; i++) {
			await overUnderCall({ side: "Under", hit: true, subjectTeamId: otherTeam })
		}
		const record = await loadTrackRecord(
			userId,
			await currentOverUnder(),
			"Bengals",
		)
		expect(rowLabeled(record, null).map((r) => r.wins)).toEqual([3])
		expect(rowLabeled(record, "Bengals")).toEqual([])
	})

	it("leaves out other stats, open questions, other callers and this question", async () => {
		const otherStat = (await makeStat({ sportId: league.sportId })).id
		const otherUser = (await makeUser()).id
		await overUnderCall({ side: "Over", hit: true, statId: otherStat })
		await overUnderCall({ side: "Over", hit: true, status: "open" })
		await overUnderCall({ side: "Over", hit: true, callerId: otherUser })
		const self = await overUnderCall({ side: "Over", hit: true })
		await overUnderCall({ side: "Over", hit: true })
		await overUnderCall({ side: "Over", hit: true })
		expect(await loadTrackRecord(userId, self, null)).toEqual([])
	})

	it("matches a team option by the team, whoever it's paired with", async () => {
		const opponent = async () => (await makeTeam({ leagueId: league.id })).id
		for (const hit of [true, true, false]) {
			const question = await makeQuestion({
				leagueId: league.id,
				shape: "team_vs_team",
				statId,
				status: "resolved",
			})
			const picked = await makeOption(question.id, {
				label: "Bengals",
				teamId,
				sortOrder: 1,
			})
			await makeOption(question.id, {
				label: "Other",
				teamId: await opponent(),
				sortOrder: 0,
			})
			await settle(picked, hit)
		}
		const question = await current({ shape: "team_vs_team", statId }, [
			{ label: "Browns", teamId: await opponent() },
			{ label: "Bengals", teamId },
		])
		const record = await loadTrackRecord(userId, question, null)
		expect(rowLabeled(record, null)).toEqual([
			{ label: "Bengals", wins: 2, losses: 1, netPoints: 60 },
		])
	})

	it("matches a statless yes/no by label", async () => {
		for (const hit of [true, false, false]) {
			const question = await makeQuestion({
				leagueId: league.id,
				shape: "yes_no_prop",
				status: "resolved",
			})
			await makeOption(question.id, { label: "Yes", sortOrder: 0 })
			const no = await makeOption(question.id, { label: "No", sortOrder: 1 })
			await settle(no, hit)
		}
		const question = await current({ shape: "yes_no_prop" }, [
			{ label: "Yes" },
			{ label: "No" },
		])
		const record = await loadTrackRecord(userId, question, null)
		expect(rowLabeled(record, null)).toEqual([
			{ label: "No", wins: 1, losses: 2, netPoints: -30 },
		])
	})

	it("pools home and road picks across every team, in the options' order", async () => {
		const newTeam = async () => (await makeTeam({ leagueId: league.id })).id
		// Three different home teams picked, so no single team reaches the floor.
		for (const hit of [true, true, false]) {
			const home = await newTeam()
			const away = await newTeam()
			const game = await makeGame({
				leagueId: league.id,
				homeTeamId: home,
				awayTeamId: away,
			})
			const question = await makeQuestion({
				leagueId: league.id,
				gameId: game.id,
				shape: "team_vs_team",
				status: "resolved",
			})
			const picked = await makeOption(question.id, {
				label: "Home team",
				teamId: home,
				sortOrder: 0,
			})
			await makeOption(question.id, {
				label: "Away team",
				teamId: away,
				sortOrder: 1,
			})
			await settle(picked, hit)
		}
		const home = await newTeam()
		const away = await newTeam()
		const game = await makeGame({
			leagueId: league.id,
			homeTeamId: home,
			awayTeamId: away,
		})
		const question = await current({ shape: "team_vs_team", gameId: game.id }, [
			{ label: "Rams", teamId: away },
			{ label: "Broncos", teamId: home },
		])
		const record = await loadTrackRecord(userId, question, null)
		expect(rowLabeled(record, null)).toEqual([])
		expect(rowLabeled(record, "Home or road")).toEqual([
			{ label: "Home", wins: 2, losses: 1, netPoints: 60 },
		])
	})
})
