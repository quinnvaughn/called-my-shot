import { builder } from "../../builder"
import { GameStatus, LeagueStatus } from "./enums"

export const CreateLeagueInput = builder.inputType("CreateLeagueInput", {
	fields: (t) => ({
		sportId: t.id({ required: true }),
		name: t.string({ required: true }),
		abbreviation: t.string({ required: true }),
		slug: t.string({ required: true }),
		status: t.field({ type: LeagueStatus, required: false }),
	}),
})
export const UpdateLeagueInput = builder.inputType("UpdateLeagueInput", {
	fields: (t) => ({
		id: t.id({ required: true }),
		sportId: t.id({ required: true }),
		name: t.string({ required: true }),
		abbreviation: t.string({ required: true }),
		slug: t.string({ required: true }),
		status: t.field({ type: LeagueStatus, required: false }),
	}),
})

export const CreateTeamInput = builder.inputType("CreateTeamInput", {
	fields: (t) => ({
		leagueId: t.id({ required: true }),
		name: t.string({ required: true }),
		abbreviation: t.string({ required: true }),
		color: t.string({ required: true }),
		conference: t.string({ required: false }),
		division: t.string({ required: false }),
	}),
})
export const UpdateTeamInput = builder.inputType("UpdateTeamInput", {
	fields: (t) => ({
		id: t.id({ required: true }),
		leagueId: t.id({ required: true }),
		name: t.string({ required: true }),
		abbreviation: t.string({ required: true }),
		color: t.string({ required: true }),
		conference: t.string({ required: false }),
		division: t.string({ required: false }),
	}),
})

export const CreatePlayerInput = builder.inputType("CreatePlayerInput", {
	fields: (t) => ({
		currentTeamId: t.id({ required: false }),
		name: t.string({ required: true }),
		position: t.string({ required: false }),
	}),
})
export const UpdatePlayerInput = builder.inputType("UpdatePlayerInput", {
	fields: (t) => ({
		id: t.id({ required: true }),
		currentTeamId: t.id({ required: false }),
		name: t.string({ required: true }),
		position: t.string({ required: false }),
	}),
})

export const CreateGameInput = builder.inputType("CreateGameInput", {
	fields: (t) => ({
		leagueId: t.id({ required: true }),
		homeTeamId: t.id({ required: true }),
		awayTeamId: t.id({ required: true }),
		startsAt: t.string({ required: true }),
		status: t.field({ type: GameStatus, required: false }),
		homeScore: t.int({ required: false }),
		awayScore: t.int({ required: false }),
	}),
})
export const UpdateGameInput = builder.inputType("UpdateGameInput", {
	fields: (t) => ({
		id: t.id({ required: true }),
		leagueId: t.id({ required: true }),
		homeTeamId: t.id({ required: true }),
		awayTeamId: t.id({ required: true }),
		startsAt: t.string({ required: true }),
		status: t.field({ type: GameStatus, required: false }),
		homeScore: t.int({ required: false }),
		awayScore: t.int({ required: false }),
	}),
})
