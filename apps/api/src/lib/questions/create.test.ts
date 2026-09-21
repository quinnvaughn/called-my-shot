import { describe, expect, it } from "vitest"
import type { Player } from "../../db/schema"
import { ValidationError } from "../errors"
import {
	type CreateQuestionData,
	optionsFor,
	type ShapeContext,
	validateShapeFields,
} from "./create"

const emptyContext: ShapeContext = {
	game: null,
	stat: null,
	subjectPlayer: null,
	subjectTeam: null,
	awardPlayerPool: null,
	awardTeamPool: null,
	gameLeaderPool: null,
}

const game = {
	homeTeamId: "home",
	awayTeamId: "away",
	homeTeamName: "Home Team",
	awayTeamName: "Away Team",
}

const input = (fields: Partial<CreateQuestionData>) =>
	fields as CreateQuestionData

// The one field error `run` throws.
function fieldError(run: () => void) {
	try {
		run()
	} catch (error) {
		if (error instanceof ValidationError) return error.fieldErrors[0]
		throw error
	}
	throw new Error("expected a field error")
}

describe("validateShapeFields", () => {
	it("asks for the line on a player over/under that has its player and game", () => {
		const error = fieldError(() =>
			validateShapeFields(
				input({ shape: "player_stat_over_under", gameId: "g" }),
				{ ...emptyContext, subjectPlayer: {} },
			),
		)
		expect(error).toEqual({ field: "ouLine", message: "Set the line" })
	})

	it("asks for a game on a matchup question without one", () => {
		const error = fieldError(() =>
			validateShapeFields(input({ shape: "team_vs_team" }), emptyContext),
		)
		expect(error).toEqual({ field: "gameId", message: "Pick a game" })
	})

	it("rejects a catalog stat tracked for the other kind of subject", () => {
		const error = fieldError(() =>
			validateShapeFields(
				input({ shape: "team_stat_numeric_guess", gameId: "g" }),
				{
					...emptyContext,
					subjectTeam: {},
					stat: { name: "Points", appliesTo: "player" },
				},
			),
		)
		expect(error).toEqual({
			field: "statId",
			message: `"Points" isn't tracked as a team stat`,
		})
	})

	it("passes a complete team over/under", () => {
		expect(() =>
			validateShapeFields(
				input({ shape: "team_stat_over_under", gameId: "g", ouLine: 100.5 }),
				{
					...emptyContext,
					subjectTeam: {},
					stat: { name: "Points", appliesTo: "both" },
				},
			),
		).not.toThrow()
	})
})

describe("optionsFor", () => {
	it("lists a matchup's away team first", () => {
		expect(
			optionsFor(input({ shape: "team_vs_team" }), { ...emptyContext, game }),
		).toEqual([
			{ label: "Away Team", teamId: "away" },
			{ label: "Home Team", teamId: "home" },
		])
	})

	it("builds a game leader pool from the rosters, not the submitted options", () => {
		const pool = [
			{ id: "p1", name: "One" },
			{ id: "p2", name: "Two" },
		] as Player[]
		expect(
			optionsFor(
				input({
					shape: "player_game_stat_leader",
					options: [{ label: "Ignored" }],
				}),
				{ ...emptyContext, gameLeaderPool: pool },
			),
		).toEqual([
			{ label: "One", playerId: "p1" },
			{ label: "Two", playerId: "p2" },
		])
	})

	it("gives a numeric guess no options", () => {
		expect(
			optionsFor(input({ shape: "player_stat_numeric_guess" }), emptyContext),
		).toEqual([])
	})
})
