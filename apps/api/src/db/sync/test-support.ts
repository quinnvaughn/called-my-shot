import { type Mock, vi } from "vitest"
import {
	makeCall,
	makeExternalRef,
	makeGame,
	makeLeague,
	makeOption,
	makePlayer,
	makeQuestion,
	makeSelection,
	makeStat,
	makeTeam,
	makeUser,
} from "../../test/factories"
import { db } from "../index"
import { defaultEspnClient, type EspnClient } from "./espn-client"

// Shared setup for the sync job tests. Not a test file itself.

export type FakeEspnClient = { [K in keyof EspnClient]: Mock<EspnClient[K]> }

// Every ESPN read as a bare mock resolving undefined, for a test to stub the
// ones its job makes.
export function fakeEspnClient(): FakeEspnClient {
	return Object.fromEntries(
		Object.keys(defaultEspnClient).map((name) => [name, vi.fn()]),
	) as unknown as FakeEspnClient
}

export const questionById = (id: string) =>
	db.query.questions.findFirst({ where: { id } })

export const autoRowFor = (questionId: string) =>
	db.query.questionAutoResolutions.findFirst({ where: { questionId } })

// A synced NBA league whose two teams carry the nba-summary.json fixture's
// ESPN ids: home "2", away "3".
export async function seedNbaLeague() {
	const league = await makeLeague({ slug: "nba" })
	const home = await makeTeam({ leagueId: league.id })
	const away = await makeTeam({ leagueId: league.id })
	await makeExternalRef("team", "nba:2", home.id)
	await makeExternalRef("team", "nba:3", away.id)
	return { league, home, away }
}

export type NbaLeague = Awaited<ReturnType<typeof seedNbaLeague>>

// A final game between the league's two teams. Its ESPN event id defaults to
// the game's own id; null leaves it unlinked.
export async function seedFinalGame(
	seeded: NbaLeague,
	options: {
		startsAt: Date
		finalizedAt?: Date
		espnEventId?: string | null
		seasonId?: string
		status?: "final" | "scheduled" | "live"
		boxScoreSyncedAt?: Date
	},
) {
	const status = options.status ?? "final"
	const game = await makeGame({
		leagueId: seeded.league.id,
		homeTeamId: seeded.home.id,
		awayTeamId: seeded.away.id,
		startsAt: options.startsAt,
		status,
		finalizedAt:
			status === "final" ? (options.finalizedAt ?? options.startsAt) : null,
		...(options.seasonId ? { seasonId: options.seasonId } : {}),
		...(options.boxScoreSyncedAt
			? { boxScoreSyncedAt: options.boxScoreSyncedAt }
			: {}),
	})
	if (options.espnEventId !== null) {
		await makeExternalRef(
			"game",
			`nba:${options.espnEventId ?? game.id}`,
			game.id,
		)
	}
	return game
}

// The nba-summary.json fixture's game (event 401811029), final, with a Points
// stat to ask about.
export async function seedNbaSummaryGame(startsAt: Date, finalizedAt: Date) {
	const seeded = await seedNbaLeague()
	const game = await seedFinalGame(seeded, {
		startsAt,
		finalizedAt,
		espnEventId: "401811029",
	})
	const stat = await makeStat({
		sportId: seeded.league.sportId,
		name: "Points",
		appliesTo: "both",
	})
	return { ...seeded, game, stat }
}

export type NbaSummaryGame = Awaited<ReturnType<typeof seedNbaSummaryGame>>

// An over/under on an away player's points in that game, with one call on the
// over.
export async function seedPointsLine(
	setup: NbaSummaryGame,
	espnAthleteId: string,
	ouLine: number,
	resolutionMode: "system" | "manual" = "system",
) {
	const player = await makePlayer({ currentTeamId: setup.away.id })
	await makeExternalRef("player", `nba:${espnAthleteId}`, player.id)
	const question = await makeQuestion({
		shape: "player_stat_over_under",
		leagueId: setup.league.id,
		sportId: setup.league.sportId,
		seasonId: setup.game.seasonId,
		gameId: setup.game.id,
		statId: setup.stat.id,
		subjectPlayerId: player.id,
		ouLine,
		status: "locked",
		locksAt: setup.game.startsAt,
		resolutionMode,
	})
	const over = await makeOption(question.id, { label: "Over", sortOrder: 0 })
	const under = await makeOption(question.id, { label: "Under", sortOrder: 1 })
	const caller = await makeUser()
	const call = await makeCall(question.id, caller.id)
	await makeSelection(call.id, over.id)
	return { question, over, under }
}
